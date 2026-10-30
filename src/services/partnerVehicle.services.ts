import prisma from "../lib/prismaClient";
import { BLOCKING_RENTAL_STATUSES, findVehicleConflict } from "../lib/rentalPricing";

const TRANSMISSIONS = ["AUTO", "MANUAL"];
const FUEL_TYPES = ["PETROL", "DIESEL", "HYBRID", "EV", "LPG"];
const DAY = 24 * 60 * 60 * 1000;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result === "" ? null : result;
}

function positiveInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function optionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function optionalFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown, field: string): Date {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`วันที่ ${field} ไม่ถูกต้อง`);
  }
  return date;
}

// ---------- สาขา ----------

async function ownedBranch(partnerId: string, branchId: string) {
  const branch = await prisma.partnerBranch.findFirst({ where: { id: branchId, partnerId } });
  if (!branch) {
    throw new Error("ไม่พบสาขา");
  }
  return branch;
}

export async function listBranchesService(partnerId: string, includeInactive = false) {
  return await prisma.partnerBranch.findMany({
    where: { partnerId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { vehicles: true } } },
  });
}

export async function createBranchService(partnerId: string, data: any) {
  const name = text(data.name);
  const address = text(data.address);
  if (name === "") throw new Error("ต้องระบุชื่อสาขา");
  if (address === "") throw new Error("ต้องระบุที่อยู่สาขา");

  return await prisma.partnerBranch.create({
    data: {
      partnerId,
      name,
      address,
      phone: optionalText(data.phone),
      openHours: optionalText(data.openHours),
      latitude: optionalFloat(data.latitude),
      longitude: optionalFloat(data.longitude),
    },
  });
}

export async function updateBranchService(partnerId: string, branchId: string, data: any) {
  await ownedBranch(partnerId, branchId);

  const payload: any = {};
  if (data.name !== undefined) {
    const name = text(data.name);
    if (name === "") throw new Error("ต้องระบุชื่อสาขา");
    payload.name = name;
  }
  if (data.address !== undefined) {
    const address = text(data.address);
    if (address === "") throw new Error("ต้องระบุที่อยู่สาขา");
    payload.address = address;
  }
  if (data.phone !== undefined) payload.phone = optionalText(data.phone);
  if (data.openHours !== undefined) payload.openHours = optionalText(data.openHours);
  if (data.latitude !== undefined) payload.latitude = optionalFloat(data.latitude);
  if (data.longitude !== undefined) payload.longitude = optionalFloat(data.longitude);
  if (typeof data.isActive === "boolean") payload.isActive = data.isActive;

  if (Object.keys(payload).length === 0) {
    throw new Error("ไม่มีค่าที่ต้องอัปเดต");
  }

  return await prisma.partnerBranch.update({ where: { id: branchId }, data: payload });
}

/** ปิดใช้งานสาขา (soft delete) — เก็บประวัติการจองไว้ */
export async function deactivateBranchService(partnerId: string, branchId: string) {
  await ownedBranch(partnerId, branchId);

  const activeRentals = await prisma.rentalDetail.count({
    where: {
      branchId,
      status: { in: [...BLOCKING_RENTAL_STATUSES] as any },
    },
  });
  if (activeRentals > 0) {
    throw new Error("สาขานี้มีการจองที่ยังไม่จบ ปิดใช้งานไม่ได้");
  }

  return await prisma.partnerBranch.update({ where: { id: branchId }, data: { isActive: false } });
}

// ---------- รถ ----------

async function ownedVehicle(partnerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, partnerId } });
  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }
  return vehicle;
}

async function replacePhotos(vehicleId: string, images: unknown) {
  if (!Array.isArray(images)) {
    return;
  }
  const urls = images
    .map((item) => text(item))
    .filter((url) => url !== "")
    .slice(0, 20);
  if (urls.length === 0) {
    return;
  }

  await prisma.vehiclePhoto.deleteMany({ where: { vehicleId } });
  await prisma.vehiclePhoto.createMany({
    data: urls.map((url, index) => ({
      vehicleId,
      url,
      isPrimary: index === 0,
      sortOrder: index,
    })),
  });
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { imageUrl: urls[0]! } });
}

export async function listPartnerVehiclesService(partnerId: string, status?: string) {
  return await prisma.vehicle.findMany({
    where: { partnerId, ...(status && status !== "ALL" ? { status: status as any } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      branch: { select: { id: true, name: true, address: true } },
      categoryRef: { select: { id: true, slug: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      _count: { select: { rentalDetails: true } },
    },
  });
}

export async function getPartnerVehicleService(partnerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, partnerId },
    include: {
      branch: true,
      categoryRef: true,
      photos: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      blocks: { where: { endAt: { gte: new Date() } }, orderBy: { startAt: "asc" } },
    },
  });
  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }
  return vehicle;
}

export async function createPartnerVehicleService(partnerId: string, partnerName: string, data: any) {
  const name = text(data.name);
  const branchId = text(data.branchId);
  const categoryId = text(data.categoryId);
  const seats = positiveInt(data.seats);
  const transmission = text(data.transmission).toUpperCase();
  const fuelType = text(data.fuelType).toUpperCase();
  const pricePerDay = positiveInt(data.pricePerDay);

  if (name === "") throw new Error("ต้องระบุชื่อรถ");
  if (branchId === "") throw new Error("ต้องเลือกสาขา");
  if (categoryId === "") throw new Error("ต้องเลือกประเภทรถ");
  if (seats === 0) throw new Error("ต้องระบุจำนวนที่นั่ง");
  if (!TRANSMISSIONS.includes(transmission)) throw new Error("ประเภทเกียร์ไม่ถูกต้อง");
  if (!FUEL_TYPES.includes(fuelType)) throw new Error("ประเภทเชื้อเพลิงไม่ถูกต้อง");
  if (pricePerDay === 0) throw new Error("ต้องระบุราคาเช่าต่อวัน");

  await ownedBranch(partnerId, branchId);
  const category = await prisma.vehicleCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new Error("ไม่พบประเภทรถ");
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      partnerId,
      branchId,
      categoryId,
      name,
      category: category.slug,
      vendor: partnerName,
      brand: optionalText(data.brand),
      modelYear: optionalInt(data.modelYear),
      seats,
      bags: Math.max(0, optionalInt(data.bags) ?? 0),
      doors: Math.max(2, optionalInt(data.doors) ?? 4),
      transmission,
      fuelType,
      pricePerDay,
      depositAmount: Math.max(0, optionalInt(data.depositAmount) ?? 0),
      licensePlate: optionalText(data.licensePlate),
      description: optionalText(data.description),
      ...(data.specs && typeof data.specs === "object" ? { specs: data.specs } : {}),
      minRentalDays: Math.max(1, optionalInt(data.minRentalDays) ?? 1),
      maxRentalDays: optionalInt(data.maxRentalDays),
      advanceBookingDays: optionalInt(data.advanceBookingDays),
      status: "DRAFT",
    },
  });

  await replacePhotos(vehicle.id, data.images);
  return await getPartnerVehicleService(partnerId, vehicle.id);
}

export async function updatePartnerVehicleService(partnerId: string, vehicleId: string, data: any) {
  const vehicle = await ownedVehicle(partnerId, vehicleId);
  const payload: any = {};

  if (data.name !== undefined) {
    const name = text(data.name);
    if (name === "") throw new Error("ต้องระบุชื่อรถ");
    payload.name = name;
  }
  if (data.branchId !== undefined) {
    const branchId = text(data.branchId);
    await ownedBranch(partnerId, branchId);
    payload.branchId = branchId;
  }
  if (data.categoryId !== undefined) {
    const categoryId = text(data.categoryId);
    const category = await prisma.vehicleCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error("ไม่พบประเภทรถ");
    payload.categoryId = categoryId;
    payload.category = category.slug;
  }
  if (data.seats !== undefined) {
    const seats = positiveInt(data.seats);
    if (seats === 0) throw new Error("ต้องระบุจำนวนที่นั่ง");
    payload.seats = seats;
  }
  if (data.transmission !== undefined) {
    const transmission = text(data.transmission).toUpperCase();
    if (!TRANSMISSIONS.includes(transmission)) throw new Error("ประเภทเกียร์ไม่ถูกต้อง");
    payload.transmission = transmission;
  }
  if (data.fuelType !== undefined) {
    const fuelType = text(data.fuelType).toUpperCase();
    if (!FUEL_TYPES.includes(fuelType)) throw new Error("ประเภทเชื้อเพลิงไม่ถูกต้อง");
    payload.fuelType = fuelType;
  }
  if (data.pricePerDay !== undefined) {
    const pricePerDay = positiveInt(data.pricePerDay);
    if (pricePerDay === 0) throw new Error("ต้องระบุราคาเช่าต่อวัน");
    payload.pricePerDay = pricePerDay;
  }
  if (data.depositAmount !== undefined) {
    payload.depositAmount = Math.max(0, optionalInt(data.depositAmount) ?? 0);
  }
  if (data.bags !== undefined) payload.bags = Math.max(0, optionalInt(data.bags) ?? 0);
  if (data.doors !== undefined) payload.doors = Math.max(2, optionalInt(data.doors) ?? 4);
  if (data.brand !== undefined) payload.brand = optionalText(data.brand);
  if (data.modelYear !== undefined) payload.modelYear = optionalInt(data.modelYear);
  if (data.licensePlate !== undefined) payload.licensePlate = optionalText(data.licensePlate);
  if (data.description !== undefined) payload.description = optionalText(data.description);
  if (data.specs !== undefined) payload.specs = data.specs === null ? null : data.specs;
  if (data.minRentalDays !== undefined) {
    payload.minRentalDays = Math.max(1, optionalInt(data.minRentalDays) ?? 1);
  }
  if (data.maxRentalDays !== undefined) payload.maxRentalDays = optionalInt(data.maxRentalDays);
  if (data.advanceBookingDays !== undefined) {
    payload.advanceBookingDays = optionalInt(data.advanceBookingDays);
  }

  if (Object.keys(payload).length > 0) {
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: payload });
  }
  await replacePhotos(vehicle.id, data.images);

  return await getPartnerVehicleService(partnerId, vehicle.id);
}

/** ส่งรถเข้าคิวให้แอดมินตรวจ (DRAFT/REJECTED → PENDING) */
export async function submitPartnerVehicleService(partnerId: string, vehicleId: string) {
  const vehicle = await ownedVehicle(partnerId, vehicleId);
  if (vehicle.status !== "DRAFT" && vehicle.status !== "REJECTED" && vehicle.status !== "PAUSED") {
    throw new Error("รถคันนี้ไม่ได้อยู่ในสถานะที่ส่งตรวจได้");
  }

  const photos = await prisma.vehiclePhoto.count({ where: { vehicleId } });
  if (photos === 0) {
    throw new Error("ต้องมีรูปรถอย่างน้อย 1 รูปก่อนส่งตรวจ");
  }

  return await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { status: "PENDING", rejectedReason: null },
  });
}

/** ลบรถ — ถ้าเคยมีการจองแล้วให้เปลี่ยนเป็น SUSPENDED เพื่อเก็บประวัติ */
export async function deletePartnerVehicleService(partnerId: string, vehicleId: string) {
  await ownedVehicle(partnerId, vehicleId);

  const active = await prisma.rentalDetail.count({
    where: { vehicleId, status: { in: [...BLOCKING_RENTAL_STATUSES] as any } },
  });
  if (active > 0) {
    throw new Error("รถคันนี้มีการจองที่ยังไม่จบ ลบไม่ได้");
  }

  const history = await prisma.rentalDetail.count({ where: { vehicleId } });
  if (history > 0) {
    return await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: "SUSPENDED" } });
  }

  return await prisma.vehicle.delete({ where: { id: vehicleId } });
}

// ---------- ปฏิทินรถ ----------

export async function vehicleCalendarService(
  partnerId: string,
  vehicleId: string,
  fromInput: unknown,
  toInput: unknown,
) {
  await ownedVehicle(partnerId, vehicleId);

  const from = fromInput ? parseDate(fromInput, "เริ่ม") : new Date();
  const to = toInput ? parseDate(toInput, "สิ้นสุด") : new Date(from.getTime() + 30 * DAY);
  if (to.getTime() <= from.getTime()) {
    throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  }

  const [rentals, blocks] = await Promise.all([
    prisma.rentalDetail.findMany({
      where: {
        vehicleId,
        status: { in: [...BLOCKING_RENTAL_STATUSES] as any },
        pickupAt: { lt: to },
        dropoffAt: { gt: from },
      },
      orderBy: { pickupAt: "asc" },
      select: {
        id: true,
        status: true,
        pickupAt: true,
        dropoffAt: true,
        booking: { select: { ref: true } },
      },
    }),
    prisma.vehicleBlock.findMany({
      where: { vehicleId, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return {
    vehicleId,
    from,
    to,
    rentals,
    blocks,
  };
}

export async function createVehicleBlockService(
  partnerId: string,
  vehicleId: string,
  data: any,
) {
  await ownedVehicle(partnerId, vehicleId);

  const startAt = parseDate(data.startAt, "เริ่ม");
  const endAt = parseDate(data.endAt, "สิ้นสุด");
  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error("ช่วงเวลาปิดไม่ถูกต้อง");
  }

  const conflict = await findVehicleConflict(vehicleId, startAt, endAt);
  if (conflict === "BOOKED") {
    throw new Error("ช่วงเวลานี้มีการจองอยู่ ปิดไม่ได้");
  }

  return await prisma.vehicleBlock.create({
    data: {
      vehicleId,
      startAt,
      endAt,
      reason: text(data.reason) || "MANUAL",
      createdBy: partnerId,
    },
  });
}

export async function deleteVehicleBlockService(partnerId: string, blockId: string) {
  const block = await prisma.vehicleBlock.findFirst({
    where: { id: blockId, vehicle: { partnerId } },
  });
  if (!block) {
    throw new Error("ไม่พบช่วงเวลาที่ปิดไว้");
  }

  return await prisma.vehicleBlock.delete({ where: { id: block.id } });
}

// ---------- แอดมินตรวจรถ ----------

export async function listVehiclesForReviewService(status: string, page: number, size: number) {
  const where = status === "ALL" ? {} : { status: status as any };
  const skip = (page - 1) * size;

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip,
      take: size,
      include: {
        partner: { select: { id: true, companyName: true, status: true } },
        branch: { select: { id: true, name: true } },
        categoryRef: { select: { id: true, name: true } },
        photos: { orderBy: { sortOrder: "asc" }, take: 3 },
      },
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function approveVehicleService(vehicleId: string, adminId: string) {
  const [vehicle] = await prisma.$transaction([
    prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: "PUBLISHED", rejectedReason: null },
    }),
    prisma.moderationLog.create({
      data: {
        adminId,
        targetType: "VEHICLE",
        targetId: vehicleId,
        action: "APPROVE_VEHICLE",
      },
    }),
  ]);

  return vehicle;
}

export async function rejectVehicleService(vehicleId: string, adminId: string, reason: string) {
  const [vehicle] = await prisma.$transaction([
    prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: "REJECTED", rejectedReason: reason },
    }),
    prisma.moderationLog.create({
      data: {
        adminId,
        targetType: "VEHICLE",
        targetId: vehicleId,
        action: "REJECT_VEHICLE",
        reason,
      },
    }),
  ]);

  return vehicle;
}
