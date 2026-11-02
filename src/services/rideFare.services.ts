import prisma from "../lib/prismaClient";
import {
  RIDE_ADDON_CATALOG,
  estimateDurationMin,
  getParcelSizeFee,
  getRideSettings,
  haversineKm,
  priceAddons,
  quoteRideFare,
  type RideServiceType,
} from "../lib/ridePricing";

/**
 * คิดราคา (quote) — ใช้ร่วมกันทั้งหน้าเรียกใช้บริการและตอนสร้างงาน
 * ราคาถูกคำนวณใหม่ที่ server ทุกครั้ง ไม่รับราคาจาก client
 */

export const RIDE_SERVICE_TYPES: RideServiceType[] = ["RIDE", "PARCEL", "LOGISTICS"];

/** นโยบายที่แสดงให้ผู้ใช้เห็น (ไม่ใช่โค้ดคิดเงิน) */
export const RIDE_POLICY = {
  fixedFare:
    "ราคาที่เห็นตอนยืนยันคือราคาที่จ่ายจริง (Fixed fare) — จะเปลี่ยนก็ต่อเมื่อผู้โดยสารเปลี่ยนเส้นทางหรือจุดหมายระหว่างทาง",
  zeroSurge:
    "เราไม่มีค่า surge pricing — ราคาปกติทุกช่วงเวลา แม้ฝนตกหรือวันหยุด (ช่วงที่มีความต้องการสูงอาจต้องรอนานขึ้น)",
};

export function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseServiceType(value: unknown): RideServiceType {
  const serviceType = text(value).toUpperCase() as RideServiceType;
  if (!RIDE_SERVICE_TYPES.includes(serviceType)) {
    throw new Error("ประเภทบริการไม่ถูกต้อง");
  }
  return serviceType;
}

export function parseCoord(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} ไม่ถูกต้อง`);
  }
  return parsed;
}

export type RidePoint = { lat: number; lng: number; address: string };

/** รับจุดรับ/ส่งได้ทั้งแบบ { pickup: { lat, lng, address } } และแบบแบน pickupLat/pickupLng */
export function readPoint(input: any, prefix: "pickup" | "dropoff"): RidePoint {
  const nested = input?.[prefix] ?? {};
  const lat = parseCoord(nested.lat ?? input?.[`${prefix}Lat`], `พิกัด${prefix === "pickup" ? "รับ" : "ส่ง"}`, -90, 90);
  const lng = parseCoord(nested.lng ?? input?.[`${prefix}Lng`], `พิกัด${prefix === "pickup" ? "รับ" : "ส่ง"}`, -180, 180);
  const address = text(nested.address ?? input?.[`${prefix}Address`]);
  if (address === "") {
    throw new Error(`ต้องระบุที่อยู่${prefix === "pickup" ? "จุดรับ" : "จุดส่ง"}`);
  }
  return { lat, lng, address };
}

export function assertTierForService(tier: { serviceType: string; isActive: boolean }, serviceType: RideServiceType) {
  if (!tier.isActive) {
    throw new Error("ชั้นราคานี้ปิดให้บริการอยู่");
  }
  if (tier.serviceType !== serviceType) {
    throw new Error("ชั้นราคานี้ไม่ตรงกับประเภทบริการ");
  }
}

export function assertPassengerCount(tier: { seats: number | null }, passengerCount: unknown) {
  const count = Math.round(Number(passengerCount) || 1);
  if (count < 1) {
    throw new Error("จำนวนผู้โดยสารต้องมากกว่า 0");
  }
  if (tier.seats && count > tier.seats) {
    throw new Error(`ชั้นราคานี้รองรับไม่เกิน ${tier.seats} ที่นั่ง`);
  }
  return count;
}

export function assertParcelLimits(
  tier: { maxWeightKg: number | null; maxDimCm: string | null },
  parcel: { weightKg?: unknown; sizeTier?: unknown },
) {
  const weightKg = Number(parcel.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error("ต้องระบุน้ำหนักพัสดุ");
  }
  if (tier.maxWeightKg && weightKg > tier.maxWeightKg) {
    throw new Error(`น้ำหนักเกินกำหนดของชั้นราคานี้ (สูงสุด ${tier.maxWeightKg} กก.)`);
  }

  const sizeTier = text(parcel.sizeTier).toUpperCase();
  if (!["S", "M", "L", "XL"].includes(sizeTier)) {
    throw new Error("ขนาดพัสดุไม่ถูกต้อง");
  }

  return { weightKg, sizeTier: sizeTier as "S" | "M" | "L" | "XL" };
}

/** รายการชั้นราคาที่เปิดให้บริการ (ใช้แสดงในหน้า /ride) */
export async function listRideTiersService(serviceType?: RideServiceType) {
  const tiers = await prisma.rideTier.findMany({
    where: {
      isActive: true,
      ...(serviceType ? { serviceType } : {}),
    },
    orderBy: [{ serviceType: "asc" }, { sortOrder: "asc" }],
  });

  return tiers;
}

/** แคตตาล็อก addon ตามประเภทบริการ */
export function listRideAddonsService(serviceType?: RideServiceType) {
  if (!serviceType) {
    return RIDE_ADDON_CATALOG;
  }
  return RIDE_ADDON_CATALOG.filter((addon) => addon.services.includes(serviceType));
}

export type RideQuoteInput = {
  serviceType?: unknown;
  tierCode?: unknown;
  pickup?: unknown;
  dropoff?: unknown;
  pickupLat?: unknown;
  pickupLng?: unknown;
  pickupAddress?: unknown;
  dropoffLat?: unknown;
  dropoffLng?: unknown;
  dropoffAddress?: unknown;
  addons?: unknown;
  parcel?: unknown;
  passengerCount?: unknown;
  commissionRate?: number | null;
};

/** คิดราคาเต็มรูปแบบ (ไม่บันทึกอะไรลง DB) */
export async function quoteRideService(input: RideQuoteInput) {
  const serviceType = parseServiceType(input.serviceType);
  const tierCode = text(input.tierCode).toUpperCase();
  if (tierCode === "") {
    throw new Error("ต้องเลือกชั้นราคา");
  }

  const tier = await prisma.rideTier.findUnique({ where: { code: tierCode } });
  if (!tier) {
    throw new Error("ไม่พบชั้นราคานี้");
  }
  assertTierForService(tier, serviceType);

  const pickup = readPoint(input, "pickup");
  const dropoff = readPoint(input, "dropoff");
  const distanceKm = haversineKm(pickup, dropoff);
  if (distanceKm <= 0) {
    throw new Error("จุดรับและจุดส่งต้องไม่ใช่ที่เดียวกัน");
  }

  const durationMin = estimateDurationMin(distanceKm, serviceType);

  let passengerCount: number | null = null;
  let parcel: { weightKg: number; sizeTier: "S" | "M" | "L" | "XL" } | null = null;

  if (serviceType === "RIDE") {
    passengerCount = assertPassengerCount(tier, input.passengerCount);
  }

  if (serviceType === "PARCEL" || serviceType === "LOGISTICS") {
    if (!input.parcel) {
      throw new Error("ต้องระบุรายละเอียดพัสดุ");
    }
    parcel = assertParcelLimits(tier, input.parcel as { weightKg?: unknown; sizeTier?: unknown });
  }

  const [settings, parcelSizeFee] = await Promise.all([getRideSettings(), getParcelSizeFee()]);
  const addons = priceAddons(serviceType, Array.isArray(input.addons) ? input.addons : []);

  const quote = quoteRideFare({
    tier,
    distanceKm,
    durationMin,
    serviceType,
    addons,
    parcel,
    settings,
    parcelSizeFee,
    commissionRate: input.commissionRate ?? null,
  });

  return {
    serviceType,
    tier: {
      code: tier.code,
      name: tier.name,
      vehicleType: tier.vehicleType,
      seats: tier.seats,
      maxWeightKg: tier.maxWeightKg,
      maxDimCm: tier.maxDimCm,
      imageUrl: tier.imageUrl,
      description: tier.description,
    },
    pickup,
    dropoff,
    distanceKm,
    durationMin,
    passengerCount,
    parcel,
    addons,
    breakdown: {
      baseFare: quote.fare,
      parcelSizeFee: quote.parcelSizeFee,
      parcelWeightFee: quote.parcelWeightFee,
      addonTotal: quote.addonTotal,
      baseAmount: quote.baseAmount,
      vatRate: quote.vatRate,
      vatAmount: quote.vatAmount,
      totalFare: quote.totalFare,
    },
    commissionRate: quote.commissionRate,
    commission: quote.commission,
    netToDriver: quote.netToDriver,
    paymentOptions: [
      { timing: "PREPAY", method: "PROMPTPAY", label: "จ่ายล่วงหน้าด้วย PromptPay QR" },
      { timing: "PREPAY", method: "CARD", label: "จ่ายล่วงหน้าด้วยบัตร" },
      { timing: "POSTPAY", method: "CASH", label: "จ่ายเงินสดกับคนขับ" },
      { timing: "POSTPAY", method: "TRANSFER", label: "โอนเงินให้คนขับ" },
    ],
    policy: RIDE_POLICY,
  };
}
