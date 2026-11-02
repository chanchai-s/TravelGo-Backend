import prisma from "../lib/prismaClient";
import { text } from "./rideFare.services";
import { getRideSettings } from "../lib/ridePricing";
import { emitToUser } from "../lib/rideRealtime";

/**
 * ฝั่งคนขับ — สมัคร / เอกสาร / รถ / เปิดรับงาน / พิกัด / รายได้
 * และฝั่งแอดมินที่อนุมัติคนขับ + ตั้งค่าคอมมิชชัน/ชั้นราคา
 */

const DRIVER_VEHICLE_TYPES = [
  "MOTORCYCLE",
  "CAR",
  "SUV",
  "VAN",
  "PICKUP",
  "TRUCK_6W",
  "TRUCK_10W",
  "TRAILER",
  "REFRIGERATED",
] as const;

const DRIVER_DOC_TYPES = [
  "ID_CARD",
  "LICENSE",
  "BLUE_BOOK",
  "INSURANCE",
  "CRIMINAL_CHECK",
  "PASSBOOK",
] as const;

const SERVICE_TYPES = ["RIDE", "PARCEL", "LOGISTICS"] as const;

function parseCoord(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} ไม่ถูกต้อง`);
  }
  return parsed;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => text(entry).toUpperCase()).filter((entry) => entry !== "");
}

// ---------- คนขับ: สมัคร / โปรไฟล์ ----------

export async function applyDriverService(userId: string, input: any) {
  if (userId === "") {
    throw new Error("ต้องเข้าสู่ระบบก่อนสมัครเป็นคนขับ");
  }

  const license = text(input?.license);
  if (license === "") {
    throw new Error("ต้องระบุเลขใบขับขี่");
  }

  const serviceTypes = parseStringArray(input?.serviceTypes);
  const tierCodes = parseStringArray(input?.tierCodes);

  const existing = await prisma.driverProfile.findUnique({ where: { userId } });
  if (existing?.status === "VERIFIED") {
    throw new Error("บัญชีนี้ยืนยันเป็นคนขับแล้ว");
  }

  if (serviceTypes.length === 0) {
    throw new Error("ต้องเลือกประเภทบริการอย่างน้อย 1 อย่าง");
  }
  for (const serviceType of serviceTypes) {
    if (!(SERVICE_TYPES as readonly string[]).includes(serviceType)) {
      throw new Error(`ประเภทบริการ ${serviceType} ไม่ถูกต้อง`);
    }
  }

  if (tierCodes.length > 0) {
    const tiers = await prisma.rideTier.findMany({
      where: { code: { in: tierCodes } },
      select: { code: true, serviceType: true },
    });
    if (tiers.length !== tierCodes.length) {
      throw new Error("มีชั้นราคาที่ไม่ถูกต้อง");
    }
    const mismatch = tiers.find((tier) => !serviceTypes.includes(tier.serviceType));
    if (mismatch) {
      throw new Error(`ชั้นราคา ${mismatch.code} ไม่ตรงกับประเภทบริการที่เลือก`);
    }
  }

  const profile = await prisma.driverProfile.upsert({
    where: { userId },
    create: {
      userId,
      license,
      status: "PENDING",
      serviceTypes,
      tierCodes,
    },
    update: {
      license,
      status: "PENDING",
      serviceTypes,
      tierCodes,
      rejectedReason: null,
      verifiedAt: null,
    },
  });

  return profile;
}

export async function getDriverMeService(userId: string) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!profile) {
    throw new Error("ยังไม่ได้สมัครเป็นคนขับ");
  }

  const [vehicles, documents, activeJob, pending, settled, today] = await Promise.all([
    prisma.driverVehicle.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.driverDocument.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.rideJob.findFirst({
      where: { driverId: userId, status: { in: ["ACCEPTED", "ARRIVING", "ARRIVED", "IN_PROGRESS"] as any } },
      include: { tier: true, rider: { select: { id: true, name: true, phone: true } } },
      orderBy: { acceptedAt: "desc" },
    }),
    prisma.driverEarning.aggregate({
      where: { driverId: userId, status: "PENDING" },
      _sum: { net: true },
    }),
    prisma.driverEarning.aggregate({
      where: { driverId: userId, status: "SETTLED" },
      _sum: { net: true },
    }),
    prisma.driverEarning.aggregate({
      where: { driverId: userId, createdAt: { gte: startOfToday() } },
      _sum: { net: true },
      _count: { _all: true },
    }),
  ]);

  const missingDocs = DRIVER_DOC_TYPES.filter(
    (type) => !documents.some((doc) => doc.type === type && doc.status === "APPROVED"),
  );

  return {
    profile,
    vehicles,
    documents,
    activeJob,
    stats: {
      pendingNet: pending._sum.net ?? 0,
      settledNet: settled._sum.net ?? 0,
      todayNet: today._sum.net ?? 0,
      todayTrips: today._count._all,
      totalTrips: profile.totalTrips,
      rating: profile.rating,
    },
    requirements: {
      requiredDocs: DRIVER_DOC_TYPES,
      missingDocs,
      canGoOnline: profile.status === "VERIFIED" && documents.some((doc) => doc.status === "APPROVED"),
    },
  };
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// ---------- คนขับ: เอกสาร ----------

export async function addDriverDocumentService(userId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error("ต้องสมัครเป็นคนขับก่อนอัปโหลดเอกสาร");
  }

  const type = text(input?.type).toUpperCase();
  if (!(DRIVER_DOC_TYPES as readonly string[]).includes(type)) {
    throw new Error("ประเภทเอกสารไม่ถูกต้อง");
  }
  const url = text(input?.url);
  if (url === "") {
    throw new Error("ต้องแนบไฟล์เอกสาร");
  }

  // อัปใหม่ทับของเดิมประเภทเดียวกัน (ของเดิมเก็บไว้เป็นประวัติ)
  const existing = await prisma.driverDocument.findFirst({
    where: { userId, type: type as any, status: "PENDING" },
  });
  if (existing) {
    return prisma.driverDocument.update({
      where: { id: existing.id },
      data: { url, reviewNote: null },
    });
  }

  return prisma.driverDocument.create({
    data: { userId, type: type as any, url, status: "PENDING" },
  });
}

export async function listDriverDocumentsService(userId: string) {
  return prisma.driverDocument.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// ---------- คนขับ: รถ ----------

export async function listDriverVehiclesService(userId: string) {
  return prisma.driverVehicle.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

export async function addDriverVehicleService(userId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error("ต้องสมัครเป็นคนขับก่อนเพิ่มรถ");
  }

  const type = text(input?.type).toUpperCase();
  if (!(DRIVER_VEHICLE_TYPES as readonly string[]).includes(type)) {
    throw new Error("ชนิดรถไม่ถูกต้อง");
  }

  const plateNo = text(input?.plateNo);
  if (plateNo === "") {
    throw new Error("ต้องระบุทะเบียนรถ");
  }

  const tierCode = text(input?.tierCode).toUpperCase();
  if (tierCode !== "") {
    const tier = await prisma.rideTier.findUnique({ where: { code: tierCode } });
    if (!tier) {
      throw new Error("ไม่พบชั้นราคาที่ผูกกับรถ");
    }
    if (tier.vehicleType !== type) {
      throw new Error("ชนิดรถไม่ตรงกับชั้นราคา");
    }
  }

  return prisma.driverVehicle.create({
    data: {
      userId,
      type: type as any,
      tierCode: tierCode || null,
      brand: text(input?.brand) || null,
      model: text(input?.model) || null,
      plateNo,
      color: text(input?.color) || null,
      seats: Number.isFinite(Number(input?.seats)) ? Math.round(Number(input.seats)) : null,
      maxWeightKg: Number.isFinite(Number(input?.maxWeightKg))
        ? Math.round(Number(input.maxWeightKg))
        : null,
      photoUrl: text(input?.photoUrl) || null,
    },
  });
}

export async function updateDriverVehicleService(userId: string, vehicleId: string, input: any) {
  const vehicle = await prisma.driverVehicle.findUnique({ where: { id: text(vehicleId) } });
  if (!vehicle || vehicle.userId !== userId) {
    throw new Error("ไม่พบรถคันนี้");
  }

  return prisma.driverVehicle.update({
    where: { id: vehicle.id },
    data: {
      brand: input?.brand === undefined ? vehicle.brand : text(input.brand) || null,
      model: input?.model === undefined ? vehicle.model : text(input.model) || null,
      plateNo: input?.plateNo === undefined ? vehicle.plateNo : text(input.plateNo) || null,
      color: input?.color === undefined ? vehicle.color : text(input.color) || null,
      seats:
        input?.seats === undefined
          ? vehicle.seats
          : Number.isFinite(Number(input.seats))
            ? Math.round(Number(input.seats))
            : vehicle.seats,
      photoUrl: input?.photoUrl === undefined ? vehicle.photoUrl : text(input.photoUrl) || null,
      isActive: input?.isActive === undefined ? vehicle.isActive : Boolean(input.isActive),
    },
  });
}

export async function deleteDriverVehicleService(userId: string, vehicleId: string) {
  const vehicle = await prisma.driverVehicle.findUnique({ where: { id: text(vehicleId) } });
  if (!vehicle || vehicle.userId !== userId) {
    throw new Error("ไม่พบรถคันนี้");
  }
  // ปิดใช้งานแทนการลบ เพื่อเก็บประวัติงาน
  return prisma.driverVehicle.update({
    where: { id: vehicle.id },
    data: { isActive: false },
  });
}

// ---------- คนขับ: เปิดรับงาน / พิกัด ----------

export async function setDriverOnlineService(userId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error("ต้องสมัครเป็นคนขับก่อน");
  }
  if (profile.status !== "VERIFIED") {
    throw new Error("บัญชีคนขับยังไม่ผ่านการยืนยัน");
  }

  const isOnline = Boolean(input?.isOnline);
  const data: any = { isOnline };

  if (isOnline && input?.lat !== undefined && input?.lng !== undefined) {
    data.lastLat = parseCoord(input.lat, "ละติจูด", -90, 90);
    data.lastLng = parseCoord(input.lng, "ลองจิจูด", -180, 180);
    data.lastLocationAt = new Date();
  }
  if (!isOnline) {
    data.lastLocationAt = new Date();
  }

  return prisma.driverProfile.update({ where: { userId }, data });
}

export async function updateDriverLocationService(userId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new Error("ต้องสมัครเป็นคนขับก่อน");
  }

  const lat = parseCoord(input?.lat, "ละติจูด", -90, 90);
  const lng = parseCoord(input?.lng, "ลองจิจูด", -180, 180);
  const jobId = text(input?.jobId) || null;

  const bearing = Number.isFinite(Number(input?.bearing)) ? Number(input.bearing) : null;
  const speed = Number.isFinite(Number(input?.speed)) ? Number(input.speed) : null;

  const location = await prisma.driverLocation.create({
    data: { driverId: userId, jobId, lat, lng, bearing, speed },
  });

  await prisma.driverProfile.update({
    where: { userId },
    data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
  });

  return location;
}

// ---------- คนขับ: รายได้ ----------

export async function listDriverEarningsService(userId: string, input: any) {
  const take = Math.min(100, Math.max(1, Number(input?.size) || 30));
  const status = text(input?.status).toUpperCase();

  const where = {
    driverId: userId,
    ...(status && status !== "ALL" ? { status } : {}),
  };

  const [items, pending, settled] = await Promise.all([
    prisma.driverEarning.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            ref: true,
            serviceType: true,
            pickupAddress: true,
            dropoffAddress: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.driverEarning.aggregate({ where: { driverId: userId, status: "PENDING" }, _sum: { net: true } }),
    prisma.driverEarning.aggregate({ where: { driverId: userId, status: "SETTLED" }, _sum: { net: true } }),
  ]);

  return {
    items,
    totals: {
      pendingNet: pending._sum.net ?? 0,
      settledNet: settled._sum.net ?? 0,
    },
  };
}

// ---------- แอดมิน: อนุมัติคนขับ ----------

export async function listDriversService(options: any) {
  const page = Math.max(1, Number(options?.page) || 1);
  const size = Math.min(100, Math.max(1, Number(options?.size) || 20));
  const status = text(options?.status).toUpperCase();
  const search = text(options?.search);

  const where: any = {
    ...(status && status !== "ALL" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search } } },
            { user: { email: { contains: search } } },
            { license: { contains: search } },
          ],
        }
      : {}),
  };

  const [profiles, total] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
            driverVehicles: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
            driverDocuments: { orderBy: { createdAt: "desc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.driverProfile.count({ where }),
  ]);

  // แบน 관계ให้ front ใช้ง่าย: profile.user (ข้อมูลบัญชี) + vehicles/documents
  const items = profiles.map((profile) => {
    const { driverVehicles, driverDocuments, ...user } = profile.user;
    return { ...profile, user, vehicles: driverVehicles, documents: driverDocuments };
  });

  return { items, total, page, size };
}

export async function verifyDriverService(profileId: string, adminId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { id: text(profileId) } });
  if (!profile) {
    throw new Error("ไม่พบคนขับ");
  }

  const commissionRate =
    input?.commissionRate === undefined ? undefined : Number(input.commissionRate);
  if (commissionRate !== undefined && (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 50)) {
    throw new Error("ค่าคอมมิชชันต้องอยู่ระหว่าง 0–50%");
  }

  const updated = await prisma.driverProfile.update({
    where: { id: profile.id },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
      rejectedReason: null,
      ...(commissionRate === undefined ? {} : { commissionRate: Math.round(commissionRate) }),
    },
  });

  emitToUser(profile.userId, "driver:verified", { status: "VERIFIED" });
  return { ...updated, reviewedBy: adminId };
}

export async function rejectDriverService(profileId: string, adminId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { id: text(profileId) } });
  if (!profile) {
    throw new Error("ไม่พบคนขับ");
  }
  const reason = text(input?.reason);
  if (reason === "") {
    throw new Error("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
  }

  const updated = await prisma.driverProfile.update({
    where: { id: profile.id },
    data: { status: "REJECTED", rejectedReason: reason, verifiedAt: null },
  });

  emitToUser(profile.userId, "driver:rejected", { status: "REJECTED", reason });
  return { ...updated, reviewedBy: adminId };
}

export async function setDriverCommissionService(profileId: string, input: any) {
  const profile = await prisma.driverProfile.findUnique({ where: { id: text(profileId) } });
  if (!profile) {
    throw new Error("ไม่พบคนขับ");
  }

  const settings = await getRideSettings();
  const raw = input?.commissionRate;
  const rate = raw === null || raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
    throw new Error(`ค่าคอมมิชชันต้องอยู่ระหว่าง 0–${Math.min(50, 100)}% (ค่าเริ่มต้น ${settings.defaultCommissionRate}%)`);
  }

  return prisma.driverProfile.update({
    where: { id: profile.id },
    data: { commissionRate: Math.round(rate) },
  });
}

export async function setDriverDocumentStatusService(documentId: string, input: any) {
  const document = await prisma.driverDocument.findUnique({ where: { id: text(documentId) } });
  if (!document) {
    throw new Error("ไม่พบเอกสาร");
  }

  const status = text(input?.status).toUpperCase();
  if (!["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    throw new Error("สถานะเอกสารไม่ถูกต้อง");
  }

  const updated = await prisma.driverDocument.update({
    where: { id: document.id },
    data: {
      status: status as any,
      reviewNote: text(input?.reviewNote) || null,
      reviewedAt: status === "PENDING" ? null : new Date(),
    },
  });

  emitToUser(document.userId, "driver:document", { documentId: document.id, status });
  return updated;
}

// ---------- แอดมิน: ชั้นราคา ----------

export async function listRideTiersForAdminService(serviceTypeInput?: string) {
  const serviceType = text(serviceTypeInput).toUpperCase();
  return prisma.rideTier.findMany({
    where: serviceType ? { serviceType: serviceType as any } : {},
    orderBy: [{ serviceType: "asc" }, { sortOrder: "asc" }],
  });
}

export async function updateRideTierService(code: string, input: any) {
  const tier = await prisma.rideTier.findUnique({ where: { code: text(code).toUpperCase() } });
  if (!tier) {
    throw new Error("ไม่พบชั้นราคานี้");
  }

  const numberFields = ["baseFare", "perKm", "perMin", "minFare", "flatFare", "includedKm", "seats", "maxWeightKg", "sortOrder"] as const;
  const data: any = {};

  for (const field of numberFields) {
    if (input?.[field] !== undefined) {
      const parsed = input[field] === null ? null : Number(input[field]);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
        throw new Error(`${field} ต้องเป็นตัวเลขไม่ติดลบ`);
      }
      data[field] = parsed === null ? null : Math.round(parsed);
    }
  }

  for (const field of ["name", "description", "maxDimCm", "imageUrl"] as const) {
    if (input?.[field] !== undefined) {
      data[field] = text(input[field]) || null;
    }
  }
  if (data.name === null) {
    throw new Error("ต้องมีชื่อชั้นราคา");
  }
  if (input?.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }

  return prisma.rideTier.update({ where: { code: tier.code }, data });
}
