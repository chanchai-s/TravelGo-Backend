import prisma from "../lib/prismaClient";
import {
  estimateDurationMin,
  getParcelSizeFee,
  getRideSettings,
  makeOtp,
  makeRideRef,
  quoteRideFare,
  type RideServiceType,
} from "../lib/ridePricing";
import { quoteRideService, text } from "./rideFare.services";
import { emitToAdmins, emitToJob, emitToUser } from "../lib/rideRealtime";

/**
 * วงจรชีวิตของงาน ride / parcel / logistics
 * REQUESTED → SEARCHING → ACCEPTED → ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED
 *                                  ↘ CANCELLED / EXPIRED
 */

export const ACTIVE_RIDE_STATUSES = ["ACCEPTED", "ARRIVING", "ARRIVED", "IN_PROGRESS"] as const;

const JOB_INCLUDE = {
  tier: true,
  rider: { select: { id: true, name: true, phone: true } },
  driver: { select: { id: true, name: true, phone: true } },
  addons: true,
  parcel: true,
  payments: { orderBy: { createdAt: "asc" as const } },
  earning: true,
  rating: true,
  statusLogs: { orderBy: { createdAt: "asc" as const } },
};

type Viewer = { userId: string; role?: string | null };

const PAYMENT_METHODS = ["CARD", "PROMPTPAY", "WALLET", "CASH", "TRANSFER"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function parsePaymentMethod(value: unknown, fallback: PaymentMethod): PaymentMethod {
  const method = text(value).toUpperCase() as PaymentMethod;
  return PAYMENT_METHODS.includes(method) ? method : fallback;
}

function parseTiming(value: unknown): "PREPAY" | "POSTPAY" {
  const timing = text(value).toUpperCase();
  if (timing !== "PREPAY" && timing !== "POSTPAY") {
    throw new Error("ต้องเลือกวิธีชำระเงิน (จ่ายล่วงหน้า / จ่ายกับคนขับ)");
  }
  return timing;
}

function isActiveStatus(status: string): boolean {
  return (ACTIVE_RIDE_STATUSES as readonly string[]).includes(status);
}

async function loadJob(jobId: string) {
  const job = await prisma.rideJob.findUnique({
    where: { id: text(jobId) },
    include: JOB_INCLUDE,
  });
  if (!job) {
    throw new Error("ไม่พบงานนี้");
  }
  return job;
}

function assertCanView(job: { riderId: string; driverId: string | null }, viewer: Viewer) {
  if (viewer.role === "ADMIN") {
    return;
  }
  if (viewer.userId === "" || (job.riderId !== viewer.userId && job.driverId !== viewer.userId)) {
    throw new Error("ไม่มีสิทธิ์ดูงานนี้");
  }
}

/** ซ่อนเบอร์โทรของอีกฝ่ายจนกว่างานจะถูกรับ (กันการติดต่อนอกระบบ) */
function maskPhones(job: any, viewer: Viewer) {
  const accepted = ["ACCEPTED", "ARRIVING", "ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(job.status);
  if (accepted || viewer.role === "ADMIN") {
    return job;
  }
  return {
    ...job,
    rider: job.rider ? { ...job.rider, phone: null } : job.rider,
    driver: job.driver ? { ...job.driver, phone: null } : job.driver,
  };
}

/** ปุ่มที่กดได้ของผู้ดูแต่ละคน — ให้ front ใช้ตัดสินใจโดยไม่ต้องเดา state เอง */
function actionsFor(job: any, viewer: Viewer): string[] {
  const actions: string[] = [];
  if (viewer.userId === job.riderId) {
    if (!["IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) {
      actions.push("CANCEL");
    }
    if (job.paymentTiming === "PREPAY" && job.paymentStatus !== "PAID" && job.status !== "CANCELLED") {
      actions.push("PAY");
    }
    if (job.status === "COMPLETED" && !job.rating) {
      actions.push("RATE");
    }
    if (!["COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) {
      actions.push("SOS", "CHAT");
    }
  }
  if (viewer.userId === job.driverId) {
    if (["ACCEPTED", "ARRIVING"].includes(job.status)) {
      actions.push("ARRIVE", "CANCEL", "CHAT");
    }
    if (job.status === "ARRIVED" || (job.status === "ACCEPTED" && job.serviceType === "RIDE")) {
      actions.push("START");
    }
    if (job.status === "IN_PROGRESS") {
      actions.push(job.serviceType === "RIDE" ? "COMPLETE" : "CONFIRM_DELIVERY", "CHAT");
    }
    if (job.paymentTiming === "POSTPAY" && job.paymentStatus !== "PAID" && job.status === "COMPLETED") {
      actions.push("COLLECT_PAYMENT");
    }
  }
  if (viewer.role === "ADMIN" && !["COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) {
    actions.push("CANCEL");
  }
  return actions;
}

async function logStatus(
  tx: any,
  jobId: string,
  fromStatus: string | null,
  toStatus: string,
  byUserId: string | null,
  note?: string | null,
) {
  await tx.rideStatusLog.create({
    data: {
      jobId,
      fromStatus: fromStatus as any,
      toStatus: toStatus as any,
      byUserId,
      note: note ?? null,
    },
  });
}

// ---------- หมดเวลาหาคนขับ ----------

/** งานที่ยัง SEARCHING เกิน TTL → EXPIRED (คืนเงินถ้าจ่ายล่วงหน้าแล้ว) */
export async function expireStaleRideJobs(): Promise<number> {
  const settings = await getRideSettings();
  const cutoff = new Date(Date.now() - settings.requestTtlMinutes * 60 * 1000);

  const stale = await prisma.rideJob.findMany({
    where: { status: "SEARCHING" as any, requestedAt: { lt: cutoff } },
    select: { id: true, paymentTiming: true, paymentStatus: true },
  });
  if (stale.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const job of stale) {
      await tx.rideJob.update({
        where: { id: job.id },
        data: {
          status: "EXPIRED" as any,
          ...(job.paymentTiming === "PREPAY" && job.paymentStatus === "PAID"
            ? { paymentStatus: "REFUNDED" as any }
            : {}),
        },
      });
      if (job.paymentTiming === "PREPAY" && job.paymentStatus === "PAID") {
        await tx.ridePayment.updateMany({
          where: { jobId: job.id, status: "PAID" as any },
          data: { status: "REFUNDED" as any },
        });
      }
      await tx.rideStatusLog.create({
        data: {
          jobId: job.id,
          fromStatus: "SEARCHING" as any,
          toStatus: "EXPIRED" as any,
          note: "หมดเวลาหาคนขับ",
        },
      });
    }
  });

  for (const job of stale) {
    emitToJob(job.id, "job:status", { jobId: job.id, status: "EXPIRED" });
  }
  return stale.length;
}

// ---------- ผู้โดยสารสร้างงาน ----------

export async function createRideJobService(riderId: string, input: any) {
  if (riderId === "") {
    throw new Error("ต้องเข้าสู่ระบบก่อนเรียกใช้บริการ");
  }

  const quote = await quoteRideService(input);
  const timing = parseTiming(input.paymentTiming ?? input.timing ?? "PREPAY");
  const method = parsePaymentMethod(
    input.paymentMethod,
    timing === "PREPAY" ? "PROMPTPAY" : "CASH",
  );

  if (timing === "PREPAY" && ["CASH", "TRANSFER"].includes(method)) {
    throw new Error("จ่ายล่วงหน้าต้องใช้บัตร / PromptPay / Wallet");
  }
  if (timing === "POSTPAY" && ["CARD", "PROMPTPAY", "WALLET"].includes(method)) {
    throw new Error("จ่ายกับคนขับต้องใช้เงินสดหรือโอนเงิน");
  }

  // กันเรียกซ้อนในบริการเดียวกัน
  const activeJob = await prisma.rideJob.findFirst({
    where: {
      riderId,
      serviceType: quote.serviceType,
      status: { in: ["REQUESTED", "SEARCHING", ...ACTIVE_RIDE_STATUSES] as any },
    },
    select: { id: true, ref: true },
  });
  if (activeJob) {
    throw new Error(`คุณมีงานที่ยังไม่จบอยู่แล้ว (${activeJob.ref})`);
  }

  const settings = await getRideSettings();
  const expiresAt = new Date(Date.now() + settings.requestTtlMinutes * 60 * 1000);
  const commissionRate = quote.commissionRate;

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.rideJob.create({
      data: {
        ref: makeRideRef(),
        riderId,
        serviceType: quote.serviceType as any,
        tierCode: quote.tier.code,
        status: "SEARCHING" as any,
        passengerCount: quote.passengerCount,
        pickupLat: quote.pickup.lat,
        pickupLng: quote.pickup.lng,
        pickupAddress: quote.pickup.address,
        dropoffLat: quote.dropoff.lat,
        dropoffLng: quote.dropoff.lng,
        dropoffAddress: quote.dropoff.address,
        distanceKm: quote.distanceKm,
        durationMin: quote.durationMin,
        baseFare: quote.breakdown.baseFare,
        addonTotal: quote.breakdown.addonTotal,
        vatAmount: quote.breakdown.vatAmount,
        fareEstimate: quote.breakdown.totalFare,
        commissionRate,
        commission: quote.commission,
        netToDriver: quote.netToDriver,
        paymentTiming: timing as any,
        paymentMethod: method as any,
        paymentStatus: "PENDING" as any,
      },
    });

    if (quote.addons.length > 0) {
      await tx.rideAddon.createMany({
        data: quote.addons.map((addon) => ({
          jobId: created.id,
          type: addon.type as any,
          name: addon.name,
          amount: addon.amount,
          qty: addon.qty,
        })),
      });
    }

    if (quote.parcel) {
      await tx.parcelDetail.create({
        data: {
          jobId: created.id,
          weightKg: quote.parcel.weightKg,
          sizeTier: quote.parcel.sizeTier as any,
          isFragile: Boolean(input?.parcel?.isFragile),
          receiverName: text(input?.parcel?.receiverName),
          receiverPhone: text(input?.parcel?.receiverPhone),
          note: text(input?.parcel?.note) || null,
          pickupOtp: makeOtp(),
          deliveryOtp: makeOtp(),
          codAmount: Math.max(0, Math.round(Number(input?.parcel?.codAmount) || 0)),
        },
      });
    }

    if (timing === "PREPAY") {
      await tx.ridePayment.create({
        data: {
          jobId: created.id,
          timing: "PREPAY" as any,
          method: method as any,
          status: "PENDING" as any,
          type: "FARE",
          amount: quote.breakdown.totalFare,
          baseAmount: quote.breakdown.baseAmount,
          vatAmount: quote.breakdown.vatAmount,
        },
      });
    }

    await logStatus(tx, created.id, "REQUESTED", "SEARCHING", riderId, "ส่งคำขอเข้าระบบ");
    return created;
  });

  const full = await getRideJobService(job.id, { userId: riderId, role: "USER" });
  emitToUser(riderId, "job:created", { jobId: job.id, ref: job.ref });
  return { ...full, expiresAt: expiresAt.toISOString() };
}

// ---------- อ่านงาน ----------

export async function getRideJobService(jobId: string, viewer: Viewer) {
  const job = await loadJob(jobId);
  assertCanView(job, viewer);

  // พิกัดล่าสุด + รถของคนขับ (ให้หน้า tracking ใช้ก่อน socket ต่อได้)
  let tracking: any = null;
  let vehicle: any = null;
  if (["ACCEPTED", "ARRIVING", "ARRIVED", "IN_PROGRESS"].includes(job.status)) {
    const [location, driverVehicle] = await Promise.all([
      prisma.driverLocation.findFirst({
        where: { jobId: job.id },
        orderBy: { recordedAt: "desc" },
      }),
      job.driverId
        ? prisma.driverVehicle.findFirst({
            where: { userId: job.driverId, isActive: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve(null),
    ]);
    tracking = location;
    vehicle = driverVehicle;
  }

  return {
    ...maskPhones(job, viewer),
    tracking,
    vehicle,
    actions: actionsFor(job, viewer),
  };
}

type ListOptions = {
  status?: string;
  serviceType?: string;
  page?: number;
  size?: number;
};

function pagination(options: ListOptions) {
  const page = Math.max(1, Number(options.page) || 1);
  const size = Math.min(50, Math.max(1, Number(options.size) || 20));
  return { page, size, skip: (page - 1) * size };
}

export async function listRiderJobsService(riderId: string, options: ListOptions) {
  const { page, size, skip } = pagination(options);
  const status = text(options.status).toUpperCase();
  const serviceType = text(options.serviceType).toUpperCase();

  const where = {
    riderId,
    ...(status && status !== "ALL" ? { status: status as any } : {}),
    ...(serviceType && serviceType !== "ALL" ? { serviceType: serviceType as any } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.rideJob.findMany({
      where,
      include: {
        tier: { select: { code: true, name: true, vehicleType: true, imageUrl: true } },
        driver: { select: { id: true, name: true, phone: true } },
        rating: true,
      },
      orderBy: { requestedAt: "desc" },
      skip,
      take: size,
    }),
    prisma.rideJob.count({ where }),
  ]);

  return { items, total, page, size };
}

export async function listAdminJobsService(options: ListOptions) {
  const { page, size, skip } = pagination(options);
  const status = text(options.status).toUpperCase();
  const serviceType = text(options.serviceType).toUpperCase();

  const where = {
    ...(status && status !== "ALL" ? { status: status as any } : {}),
    ...(serviceType && serviceType !== "ALL" ? { serviceType: serviceType as any } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.rideJob.findMany({
      where,
      include: {
        tier: { select: { code: true, name: true } },
        rider: { select: { id: true, name: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true } },
        sosEvents: { where: { status: { in: ["OPEN", "ACK"] as any } } },
      },
      orderBy: { requestedAt: "desc" },
      skip,
      take: size,
    }),
    prisma.rideJob.count({ where }),
  ]);

  return { items, total, page, size };
}

// ---------- ยกเลิก ----------

export async function cancelRideJobService(jobId: string, viewer: Viewer, reasonInput?: string) {
  const job = await loadJob(jobId);
  const reason = text(reasonInput);

  if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) {
    throw new Error("งานนี้จบแล้ว ยกเลิกไม่ได้");
  }

  const isAdmin = viewer.role === "ADMIN";
  const isRider = job.riderId === viewer.userId;
  const isDriver = job.driverId === viewer.userId;

  if (!isAdmin && !isRider && !isDriver) {
    throw new Error("ไม่มีสิทธิ์ยกเลิกงานนี้");
  }

  if (isRider && ["IN_PROGRESS"].includes(job.status)) {
    throw new Error("เริ่มเดินทางแล้ว กรุณาติดต่อฝ่ายบริการ");
  }
  if (isDriver) {
    if (!["ACCEPTED", "ARRIVING"].includes(job.status)) {
      throw new Error("ยกเลิกได้ก่อนถึงจุดรับเท่านั้น");
    }
    if (reason === "") {
      throw new Error("กรุณาระบุเหตุผลที่ยกเลิก");
    }
  }

  const cancelBy = isAdmin ? "ADMIN" : isDriver ? "DRIVER" : "RIDER";

  const result = await prisma.$transaction(async (tx) => {
    await tx.rideJob.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED" as any,
        cancelledAt: new Date(),
        cancelReason: reason || null,
        cancelBy,
      },
    });

    // คืนเงินงานที่จ่ายล่วงหน้าแล้ว
    if (job.paymentTiming === "PREPAY" && job.paymentStatus === "PAID") {
      await tx.ridePayment.updateMany({
        where: { jobId: job.id, status: "PAID" as any },
        data: { status: "REFUNDED" as any },
      });
      await tx.rideJob.update({
        where: { id: job.id },
        data: { paymentStatus: "REFUNDED" as any },
      });
    }

    await logStatus(tx, job.id, job.status, "CANCELLED", viewer.userId || null, reason || null);
    return tx.rideJob.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  });

  if (job.driverId) {
    emitToUser(job.driverId, "job:cancelled", { jobId: job.id, reason, by: cancelBy });
  }
  emitToUser(job.riderId, "job:cancelled", { jobId: job.id, reason, by: cancelBy });
  emitToJob(job.id, "job:status", { jobId: job.id, status: "CANCELLED", reason });

  return result;
}

// ---------- ชำระเงินล่วงหน้า (mock gateway) ----------

export async function payRideJobService(jobId: string, riderId: string, input: any) {
  const job = await loadJob(jobId);
  if (job.riderId !== riderId) {
    throw new Error("ไม่ใช่ผู้โดยสารของงานนี้");
  }
  if (job.paymentTiming !== "PREPAY") {
    throw new Error("งานนี้ชำระกับคนขับ ไม่ต้องจ่ายล่วงหน้า");
  }
  if (job.paymentStatus === "PAID") {
    throw new Error("ชำระเงินแล้ว");
  }
  if (["CANCELLED", "EXPIRED"].includes(job.status)) {
    throw new Error("งานถูกยกเลิกแล้ว");
  }

  const method = parsePaymentMethod(input?.method, "PROMPTPAY");
  const gatewayRef = text(input?.gatewayRef) || `MOCK-${Date.now()}`;

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.ridePayment.findFirst({
      where: { jobId: job.id, timing: "PREPAY" as any, status: "PENDING" as any },
      orderBy: { createdAt: "desc" },
    });

    if (payment) {
      await tx.ridePayment.update({
        where: { id: payment.id },
        data: { status: "PAID" as any, method: method as any, gatewayRef, paidAt: new Date() },
      });
    } else {
      await tx.ridePayment.create({
        data: {
          jobId: job.id,
          timing: "PREPAY" as any,
          method: method as any,
          status: "PAID" as any,
          type: "FARE",
          amount: job.fareEstimate,
          baseAmount: job.baseFare + job.addonTotal,
          vatAmount: job.vatAmount,
          gatewayRef,
          paidAt: new Date(),
        },
      });
    }

    return tx.rideJob.update({
      where: { id: job.id },
      data: { paymentStatus: "PAID" as any, paymentMethod: method as any },
    });
  });

  emitToUser(riderId, "job:payment", { jobId: job.id, status: "PAID" });
  emitToJob(job.id, "job:payment", { jobId: job.id, status: "PAID" });
  return result;
}

// ---------- ให้คะแนน ----------

export async function rateRideJobService(jobId: string, riderId: string, input: any) {
  const job = await loadJob(jobId);
  if (job.riderId !== riderId) {
    throw new Error("ให้คะแนนได้เฉพาะงานของคุณ");
  }
  if (job.status !== "COMPLETED") {
    throw new Error("ให้คะแนนได้หลังจบงานแล้ว");
  }
  if (job.rating) {
    throw new Error("ให้คะแนนงานนี้แล้ว");
  }
  if (!job.driverId) {
    throw new Error("งานนี้ยังไม่มีคนขับ");
  }

  const stars = Math.round(Number(input?.stars));
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    throw new Error("คะแนนต้องอยู่ระหว่าง 1–5 ดาว");
  }

  const rating = await prisma.$transaction(async (tx) => {
    const created = await tx.rideRating.create({
      data: {
        jobId: job.id,
        riderId,
        driverId: job.driverId as string,
        stars,
        text: text(input?.text) || null,
      },
    });

    const aggregate = await tx.rideRating.aggregate({
      where: { driverId: job.driverId as string },
      _avg: { stars: true },
      _count: { _all: true },
    });

    await tx.driverProfile.updateMany({
      where: { userId: job.driverId as string },
      data: { rating: Math.round((aggregate._avg.stars ?? 5) * 100) / 100 },
    });

    return created;
  });

  emitToUser(job.driverId, "job:rating", {
    jobId: job.id,
    stars,
    average: rating.stars,
  });
  return rating;
}

// ---------- ฝั่งคนขับ: งานที่รับได้ ----------

type DriverLike = {
  userId: string;
  status: string;
  isOnline: boolean;
  tierCodes: unknown;
  lastLat: number | null;
  lastLng: number | null;
};

async function requireVerifiedDriver(userId: string): Promise<any> {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true, phone: true } } },
  });
  if (!driver) {
    throw new Error("ต้องสมัครเป็นคนขับก่อน");
  }
  if (driver.status !== "VERIFIED") {
    throw new Error("บัญชีคนขับยังไม่ผ่านการยืนยัน");
  }
  return driver;
}

function tierCodesOf(driver: DriverLike): string[] {
  return Array.isArray(driver.tierCodes) ? (driver.tierCodes as string[]) : [];
}

export async function listAvailableJobsService(driverId: string, serviceTypeInput?: string) {
  const driver = await requireVerifiedDriver(driverId);
  if (!driver.isOnline) {
    throw new Error("กรุณาเปิดรับงานก่อน");
  }

  const serviceType = text(serviceTypeInput).toUpperCase() as RideServiceType;
  const tierCodes = tierCodesOf(driver as unknown as DriverLike);
  const settings = await getRideSettings();

  const jobs = await prisma.rideJob.findMany({
    where: {
      status: "SEARCHING" as any,
      ...(serviceType ? { serviceType: serviceType as any } : {}),
      ...(tierCodes.length > 0 ? { tierCode: { in: tierCodes } } : {}),
      driverId: null,
      OR: [{ paymentTiming: "POSTPAY" as any }, { paymentStatus: "PAID" as any }],
    },
    include: {
      tier: true,
      rider: { select: { id: true, name: true, phone: true } },
      parcel: true,
      addons: true,
    },
    orderBy: { requestedAt: "asc" },
    take: 50,
  });

  return jobs
    .map((job) => {
      let pickupDistanceKm: number | null = null;
      if (driver.lastLat !== null && driver.lastLng !== null) {
        const dLat = (job.pickupLat - driver.lastLat) * 111;
        const dLng = (job.pickupLng - driver.lastLng) * 111 * Math.cos((driver.lastLat * Math.PI) / 180);
        pickupDistanceKm = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 10) / 10;
      }
      return {
        ...job,
        pickupDistanceKm,
        // ไม่ส่งเบอร์ผู้โดยสารก่อนรับงาน
        rider: { ...job.rider, phone: null },
      };
    })
    .filter((job) => {
      if (job.pickupDistanceKm === null) {
        return true;
      }
      return job.pickupDistanceKm <= settings.searchRadiusKm;
    })
    .sort((a, b) => (a.pickupDistanceKm ?? 999) - (b.pickupDistanceKm ?? 999));
}

// ---------- ฝั่งคนขับ: รับงาน / ถึงจุดรับ / เริ่ม / จบ ----------

export async function acceptRideJobService(driverId: string, jobId: string) {
  const driver = await requireVerifiedDriver(driverId);
  if (!driver.isOnline) {
    throw new Error("กรุณาเปิดรับงานก่อน");
  }

  const job = await loadJob(jobId);
  if (job.status !== "SEARCHING") {
    throw new Error("งานนี้ถูกรับไปแล้วหรือปิดรับ");
  }
  if (job.paymentTiming === "PREPAY" && job.paymentStatus !== "PAID") {
    throw new Error("ผู้โดยสารยังไม่ได้ชำระเงินล่วงหน้า");
  }
  if (job.riderId === driverId) {
    throw new Error("รับงานของตัวเองไม่ได้");
  }

  const tierCodes = tierCodesOf(driver as unknown as DriverLike);
  if (tierCodes.length > 0 && !tierCodes.includes(job.tierCode)) {
    throw new Error("ชั้นราคานี้ยังไม่ได้รับอนุมัติให้ขับ");
  }

  const activeJob = await prisma.rideJob.findFirst({
    where: { driverId, status: { in: [...ACTIVE_RIDE_STATUSES] as any } },
    select: { id: true, ref: true },
  });
  if (activeJob) {
    throw new Error(`คุณมีงานที่ยังไม่จบอยู่แล้ว (${activeJob.ref})`);
  }

  // update แบบมีเงื่อนไข status เดิม เพื่อกันสองคนรับงานเดียวกันพร้อมกัน
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.rideJob.updateMany({
      where: { id: job.id, status: "SEARCHING" as any, driverId: null },
      data: {
        driverId,
        status: "ACCEPTED" as any,
        acceptedAt: new Date(),
      },
    });
    if (result.count === 0) {
      throw new Error("งานนี้ถูกรับไปแล้ว");
    }
    await logStatus(tx, job.id, "SEARCHING", "ACCEPTED", driverId, null);
    return tx.rideJob.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  });

  emitToUser(job.riderId, "job:accepted", {
    jobId: job.id,
    driver: { id: driverId, name: driver.user?.name ?? null, phone: driver.user?.phone ?? null },
  });
  emitToJob(job.id, "job:status", { jobId: job.id, status: "ACCEPTED" });
  return updated;
}

export async function arriveRideJobService(driverId: string, jobId: string) {
  const job = await loadJob(jobId);
  if (job.driverId !== driverId) {
    throw new Error("ไม่ใช่คนขับของงานนี้");
  }
  if (!["ACCEPTED", "ARRIVING"].includes(job.status)) {
    throw new Error("สถานะงานไม่อยู่ในขั้นตอนเดินทางไปรับ");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.rideJob.update({
      where: { id: job.id },
      data: { status: "ARRIVED" as any, arrivedAt: new Date() },
    });
    await logStatus(tx, job.id, job.status, "ARRIVED", driverId, null);
    return tx.rideJob.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  });

  emitToUser(job.riderId, "job:arrived", { jobId: job.id, at: new Date().toISOString() });
  emitToJob(job.id, "job:status", { jobId: job.id, status: "ARRIVED" });
  return updated;
}

export async function startRideJobService(driverId: string, jobId: string) {
  const job = await loadJob(jobId);
  if (job.driverId !== driverId) {
    throw new Error("ไม่ใช่คนขับของงานนี้");
  }
  if (!["ARRIVED", "ACCEPTED"].includes(job.status)) {
    throw new Error("เริ่มงานได้หลังถึงจุดรับแล้ว");
  }
  if (job.serviceType === "PARCEL" && job.paymentTiming === "PREPAY" && job.paymentStatus !== "PAID") {
    throw new Error("ผู้โดยสารยังไม่ได้ชำระเงินล่วงหน้า");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.rideJob.update({
      where: { id: job.id },
      data: { status: "IN_PROGRESS" as any, startedAt: new Date() },
    });
    await logStatus(tx, job.id, job.status, "IN_PROGRESS", driverId, null);
    return tx.rideJob.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  });

  emitToUser(job.riderId, "job:started", { jobId: job.id, at: new Date().toISOString() });
  emitToJob(job.id, "job:status", { jobId: job.id, status: "IN_PROGRESS" });
  return updated;
}

type FinishOptions = {
  distanceKm?: unknown;
  durationMin?: unknown;
  proofPhotoUrl?: unknown;
  signatureUrl?: unknown;
  deliveryOtp?: unknown;
  codCollected?: unknown;
};

/** คิดราคาสุดท้าย + ปิดงาน + ออก earning (ใช้ทั้ง RIDE และ PARCEL/LOGISTICS) */
async function finishJob(driverId: string, jobId: string, options: FinishOptions) {
  const job = await loadJob(jobId);
  if (job.driverId !== driverId) {
    throw new Error("ไม่ใช่คนขับของงานนี้");
  }
  if (job.status !== "IN_PROGRESS") {
    throw new Error("ปิดงานได้หลังเริ่มเดินทางแล้ว");
  }

  // PARCEL / LOGISTICS ต้องยืนยัน OTP ก่อนปิดงาน
  if (job.serviceType !== "RIDE") {
    if (!job.parcel) {
      throw new Error("ไม่พบข้อมูลพัสดุ");
    }
    const otp = text(options.deliveryOtp);
    if (otp === "" || otp !== job.parcel.deliveryOtp) {
      throw new Error("OTP ยืนยันการส่งไม่ถูกต้อง");
    }
  }

  const extraDistance = Number(options.distanceKm);
  const distanceKm =
    Number.isFinite(extraDistance) && extraDistance > 0 ? extraDistance : job.distanceKm;
  const durationMin =
    Number.isFinite(Number(options.durationMin)) && Number(options.durationMin) > 0
      ? Math.round(Number(options.durationMin))
      : job.durationMin || estimateDurationMin(distanceKm, job.serviceType as RideServiceType);

  const [settings, parcelSizeFee] = await Promise.all([getRideSettings(), getParcelSizeFee()]);
  const quote = quoteRideFare({
    tier: {
      code: job.tier.code,
      serviceType: job.tier.serviceType,
      baseFare: job.tier.baseFare,
      perKm: job.tier.perKm,
      perMin: job.tier.perMin,
      minFare: job.tier.minFare,
      flatFare: job.tier.flatFare,
      includedKm: job.tier.includedKm,
    },
    distanceKm,
    durationMin,
    serviceType: job.serviceType as RideServiceType,
    addons: job.addons.map((addon) => ({ type: addon.type, qty: addon.qty })),
    parcel: job.parcel
      ? { weightKg: job.parcel.weightKg, sizeTier: job.parcel.sizeTier as "S" | "M" | "L" | "XL" }
      : null,
    settings,
    parcelSizeFee,
    commissionRate: job.commissionRate,
  });

  const codAmount = job.parcel?.codAmount ?? 0;
  const codCollected = Boolean(options.codCollected) || codAmount === 0;
  if (codAmount > 0 && !codCollected) {
    throw new Error("ต้องเก็บเงินปลายทาง (COD) ให้ครบก่อนปิดงาน");
  }

  const now = new Date();
  const driverAlreadyHasCash = job.paymentTiming === "POSTPAY" && job.paymentMethod !== "CARD";

  const updated = await prisma.$transaction(async (tx) => {
    if (job.parcel) {
      await tx.parcelDetail.update({
        where: { jobId: job.id },
        data: {
          proofPhotoUrl: text(options.proofPhotoUrl) || job.parcel.proofPhotoUrl,
          signatureUrl: text(options.signatureUrl) || job.parcel.signatureUrl,
        },
      });
    }

    const result = await tx.rideJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED" as any,
        completedAt: now,
        distanceKm,
        durationMin,
        baseFare: quote.fare,
        addonTotal: quote.addonTotal,
        vatAmount: quote.vatAmount,
        fareFinal: quote.totalFare,
        commissionRate: quote.commissionRate,
        commission: quote.commission,
        netToDriver: quote.netToDriver,
      },
    });

    // POSTPAY: เก็บเงินกับคนขับ
    if (job.paymentTiming === "POSTPAY") {
      await tx.ridePayment.create({
        data: {
          jobId: job.id,
          timing: "POSTPAY" as any,
          method: job.paymentMethod,
          status: driverAlreadyHasCash ? ("PAID" as any) : ("PENDING" as any),
          type: "FARE",
          amount: quote.totalFare + codAmount,
          baseAmount: quote.baseAmount,
          vatAmount: quote.vatAmount,
          paidAt: driverAlreadyHasCash ? now : null,
        },
      });
      if (driverAlreadyHasCash) {
        await tx.rideJob.update({
          where: { id: job.id },
          data: { paymentStatus: "PAID" as any },
        });
      }
    }

    await tx.driverEarning.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        driverId,
        gross: quote.fare,
        commission: quote.commission,
        net: quote.netToDriver,
        status: driverAlreadyHasCash ? "SETTLED" : "PENDING",
        paidAt: driverAlreadyHasCash ? now : null,
      },
      update: {
        gross: quote.fare,
        commission: quote.commission,
        net: quote.netToDriver,
        status: driverAlreadyHasCash ? "SETTLED" : "PENDING",
        paidAt: driverAlreadyHasCash ? now : null,
      },
    });

    await tx.driverProfile.updateMany({
      where: { userId: driverId },
      data: { totalTrips: { increment: 1 } },
    });

    await logStatus(tx, job.id, "IN_PROGRESS", "COMPLETED", driverId, null);
    return result;
  });

  emitToUser(job.riderId, "job:completed", {
    jobId: job.id,
    fareFinal: quote.totalFare,
    paymentStatus: driverAlreadyHasCash ? "PAID" : job.paymentTiming === "PREPAY" ? "PAID" : "PENDING",
  });
  emitToJob(job.id, "job:status", { jobId: job.id, status: "COMPLETED" });
  return updated;
}

/** จบงาน RIDE — ราคา fixed เว้นแต่มีการเปลี่ยนเส้นทาง (ส่ง distanceKm มา) */
export async function completeRideJobService(driverId: string, jobId: string, options: FinishOptions) {
  const job = await loadJob(jobId);
  if (job.serviceType !== "RIDE") {
    throw new Error("งานนี้ต้องยืนยันการส่งด้วย OTP");
  }
  return finishJob(driverId, jobId, options);
}

/** ยืนยันส่งพัสดุ — OTP + รูปหลักฐาน + COD */
export async function confirmDeliveryService(driverId: string, jobId: string, options: FinishOptions) {
  const job = await loadJob(jobId);
  if (job.serviceType === "RIDE") {
    throw new Error("งานนี้เป็นงานโดยสาร ใช้ปุ่มจบงานปกติ");
  }
  return finishJob(driverId, jobId, options);
}

/** เก็บเงินปลายทาง/POSTPAY — คนขับกดยืนยันว่าได้รับเงินแล้ว */
export async function collectPaymentService(driverId: string, jobId: string, input: any) {
  const job = await loadJob(jobId);
  if (job.driverId !== driverId) {
    throw new Error("ไม่ใช่คนขับของงานนี้");
  }
  if (job.paymentTiming !== "POSTPAY") {
    throw new Error("งานนี้จ่ายล่วงหน้าแล้ว");
  }
  if (job.paymentStatus === "PAID") {
    throw new Error("บันทึกการรับเงินแล้ว");
  }

  const method = parsePaymentMethod(input?.method, job.paymentMethod as PaymentMethod);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.ridePayment.updateMany({
      where: { jobId: job.id, status: "PENDING" as any },
      data: { status: "PAID" as any, method: method as any, paidAt: now },
    });
    await tx.rideJob.update({
      where: { id: job.id },
      data: { paymentStatus: "PAID" as any, paymentMethod: method as any },
    });
    await tx.driverEarning.updateMany({
      where: { jobId: job.id, status: "PENDING" },
      data: { status: "SETTLED", paidAt: now },
    });
    return tx.rideJob.findUnique({ where: { id: job.id }, include: JOB_INCLUDE });
  });

  emitToUser(job.riderId, "job:payment", { jobId: job.id, status: "PAID", method });
  emitToAdmins("job:payment", { jobId: job.id, status: "PAID", method });
  return updated;
}
