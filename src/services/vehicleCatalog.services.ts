import prisma from "../lib/prismaClient";
import { findVehicleConflict, getRentalSettings, quoteRental, rentalDays } from "../lib/rentalPricing";

/**
 * แคตตาล็อกรถเช่าสาธารณะ
 * - เห็นเฉพาะรถที่ PUBLISHED และเจ้าของ (partner) ผ่านการยืนยันแล้ว
 * - ค้นหาตามช่วงวันที่ได้ (ตัดรถที่ถูกจอง/ปิดปฏิทินออก)
 */

const PUBLIC_VEHICLE_WHERE = {
  status: "PUBLISHED" as const,
  partner: { status: "VERIFIED" as const },
};

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listVehicleCategoriesService() {
  return await prisma.vehicleCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, sortOrder: true },
  });
}

/** สาขาที่มีรถพร้อมให้เช่าอยู่จริง (ใช้ทำตัวกรองสาขา) */
export async function listVehicleBranchesService() {
  const rows = await prisma.partnerBranch.findMany({
    where: {
      isActive: true,
      partner: { status: "VERIFIED" },
      vehicles: {
        some: { status: "PUBLISHED" },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      partner: { select: { companyName: true } },
      _count: { select: { vehicles: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    partnerName: row.partner?.companyName ?? null,
    vehicleCount: row._count.vehicles,
  }));
}

export type VehicleSearchParams = {
  q?: unknown;
  categorySlug?: unknown;
  branchId?: unknown;
  pickupAt?: unknown;
  dropoffAt?: unknown;
  transmission?: unknown;
  minSeats?: unknown;
  maxPrice?: unknown;
  page?: unknown;
  size?: unknown;
};

export async function searchVehiclesService(params: VehicleSearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const size = Math.min(50, Math.max(1, Number(params.size) || 20));
  const skip = (page - 1) * size;

  const pickupAt = optionalDate(params.pickupAt);
  const dropoffAt = optionalDate(params.dropoffAt);
  const hasRange = pickupAt !== null && dropoffAt !== null && dropoffAt.getTime() > pickupAt.getTime();

  const q = String(params.q ?? "").trim();
  const categorySlug = String(params.categorySlug ?? "").trim();
  const branchId = String(params.branchId ?? "").trim();
  const transmission = String(params.transmission ?? "").trim().toUpperCase();
  const minSeats = Number(params.minSeats) || 0;
  const maxPrice = Number(params.maxPrice) || 0;

  const where: any = { ...PUBLIC_VEHICLE_WHERE };
  if (q !== "") {
    where.OR = [{ name: { contains: q } }, { brand: { contains: q } }, { vendor: { contains: q } }];
  }
  if (categorySlug !== "") {
    where.categoryRef = { slug: categorySlug };
  }
  if (branchId !== "") {
    where.branchId = branchId;
  }
  if (transmission !== "") {
    where.transmission = transmission;
  }
  if (minSeats > 0) {
    where.seats = { gte: minSeats };
  }
  if (maxPrice > 0) {
    where.pricePerDay = { lte: maxPrice };
  }

  // ดึงเกินจำนวนไว้ก่อนเพื่อกรองรถที่ชนช่วงเวลาออก แล้วค่อยแบ่งหน้าเอง
  const all = await prisma.vehicle.findMany({
    where,
    orderBy: [{ pricePerDay: "asc" }, { createdAt: "desc" }],
    include: {
      branch: { select: { id: true, name: true, address: true } },
      categoryRef: { select: { id: true, slug: true, name: true } },
      partner: { select: { id: true, companyName: true } },
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  let list = all;
  if (hasRange) {
    const conflicts = await Promise.all(
      all.map((vehicle) => findVehicleConflict(vehicle.id, pickupAt!, dropoffAt!)),
    );
    list = all.filter((_, index) => conflicts[index] === null);
  }

  const total = list.length;
  const items = list.slice(skip, skip + size).map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.name,
    brand: vehicle.brand,
    category: vehicle.categoryRef,
    partner: vehicle.partner,
    branch: vehicle.branch,
    seats: vehicle.seats,
    bags: vehicle.bags,
    doors: vehicle.doors,
    transmission: vehicle.transmission,
    fuelType: vehicle.fuelType,
    pricePerDay: vehicle.pricePerDay,
    depositAmount: vehicle.depositAmount,
    imageUrl: vehicle.imageUrl ?? vehicle.photos[0]?.url ?? null,
    specs: vehicle.specs,
    minRentalDays: vehicle.minRentalDays,
    maxRentalDays: vehicle.maxRentalDays,
  }));

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function getVehicleDetailService(vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...PUBLIC_VEHICLE_WHERE },
    include: {
      branch: true,
      categoryRef: true,
      partner: { select: { id: true, companyName: true, contactPhone: true, contactEmail: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, rating: true, text: true, createdAt: true },
      },
    },
  });

  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }

  const settings = await getRentalSettings();
  const reviewCount = vehicle.reviews.length;
  const rating =
    reviewCount === 0
      ? null
      : vehicle.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount;

  return {
    id: vehicle.id,
    name: vehicle.name,
    brand: vehicle.brand,
    modelYear: vehicle.modelYear,
    description: vehicle.description,
    category: vehicle.categoryRef,
    partner: vehicle.partner,
    branch: vehicle.branch,
    seats: vehicle.seats,
    bags: vehicle.bags,
    doors: vehicle.doors,
    transmission: vehicle.transmission,
    fuelType: vehicle.fuelType,
    pricePerDay: vehicle.pricePerDay,
    depositAmount: vehicle.depositAmount,
    specs: vehicle.specs,
    supportsSelfDrive: vehicle.supportsSelfDrive,
    supportsChauffeur: vehicle.supportsChauffeur,
    allowOneWay: vehicle.allowOneWay,
    deliveryAvailable: vehicle.deliveryAvailable,
    minRentalDays: vehicle.minRentalDays,
    maxRentalDays: vehicle.maxRentalDays,
    advanceBookingDays: vehicle.advanceBookingDays,
    photos: vehicle.photos,
    reviews: vehicle.reviews,
    rating,
    reviewCount,
    rentalRules: {
      vatRate: settings.vatRate,
      lateFeePerHour: settings.lateFeePerHour,
      lateGraceMinutes: settings.lateGraceMinutes,
      selfDriveOnly: true,
      returnSameBranch: true,
    },
  };
}

export async function checkVehicleAvailabilityService(
  vehicleId: string,
  pickupInput: unknown,
  dropoffInput: unknown,
) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...PUBLIC_VEHICLE_WHERE },
    select: { id: true, minRentalDays: true, maxRentalDays: true },
  });
  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }

  const pickupAt = optionalDate(pickupInput);
  const dropoffAt = optionalDate(dropoffInput);
  if (!pickupAt || !dropoffAt || dropoffAt.getTime() <= pickupAt.getTime()) {
    throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  }

  const days = rentalDays(pickupAt, dropoffAt);
  if (days < vehicle.minRentalDays) {
    return {
      available: false,
      reason: `ต้องเช่าอย่างน้อย ${vehicle.minRentalDays} วัน`,
      days,
    };
  }
  if (vehicle.maxRentalDays && days > vehicle.maxRentalDays) {
    return {
      available: false,
      reason: `เช่าได้ไม่เกิน ${vehicle.maxRentalDays} วัน`,
      days,
    };
  }

  const conflict = await findVehicleConflict(vehicle.id, pickupAt, dropoffAt);
  if (conflict === "BOOKED") {
    return { available: false, reason: "รถถูกจองในช่วงเวลานี้แล้ว", days };
  }
  if (conflict === "BLOCKED") {
    return { available: false, reason: "รถไม่ว่างในช่วงเวลานี้", days };
  }

  return { available: true, reason: null, days };
}

export async function quoteVehicleService(
  vehicleId: string,
  pickupInput: unknown,
  dropoffInput: unknown,
) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ...PUBLIC_VEHICLE_WHERE },
    select: {
      id: true,
      pricePerDay: true,
      depositAmount: true,
      minRentalDays: true,
      maxRentalDays: true,
      partner: { select: { commissionRate: true } },
    },
  });
  if (!vehicle) {
    throw new Error("ไม่พบรถ");
  }

  const pickupAt = optionalDate(pickupInput);
  const dropoffAt = optionalDate(dropoffInput);
  if (!pickupAt || !dropoffAt || dropoffAt.getTime() <= pickupAt.getTime()) {
    throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  }

  const days = rentalDays(pickupAt, dropoffAt);
  if (days < vehicle.minRentalDays) {
    throw new Error(`ต้องเช่าอย่างน้อย ${vehicle.minRentalDays} วัน`);
  }
  if (vehicle.maxRentalDays && days > vehicle.maxRentalDays) {
    throw new Error(`เช่าได้ไม่เกิน ${vehicle.maxRentalDays} วัน`);
  }

  const conflict = await findVehicleConflict(vehicle.id, pickupAt, dropoffAt);
  if (conflict === "BOOKED") {
    throw new Error("รถถูกจองในช่วงเวลานี้แล้ว");
  }
  if (conflict === "BLOCKED") {
    throw new Error("รถไม่ว่างในช่วงเวลานี้");
  }

  const settings = await getRentalSettings();
  const quote = quoteRental({
    pricePerDay: vehicle.pricePerDay,
    depositAmount: vehicle.depositAmount,
    days,
    settings,
    commissionRate: vehicle.partner?.commissionRate ?? null,
  });

  // ลูกค้าเห็นเฉพาะยอดที่ต้องจ่าย (ไม่เห็นค่า commission ของแพลตฟอร์ม)
  return {
    vehicleId: vehicle.id,
    pickupAt,
    dropoffAt,
    days: quote.days,
    pricePerDay: quote.pricePerDay,
    rentalTotal: quote.rentalTotal,
    baseAmount: quote.baseAmount,
    vatAmount: quote.vatAmount,
    vatRate: quote.vatRate,
    depositAmount: quote.depositAmount,
    totalDueAtBranch: quote.rentalTotal + quote.depositAmount,
  };
}
