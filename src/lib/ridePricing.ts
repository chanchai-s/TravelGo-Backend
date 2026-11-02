import prisma from "./prismaClient";

/**
 * สูตรคิดเงินของ ride / parcel / logistics
 * - เงินเป็นจำนวนเต็มบาท (Int) เหมือน rentcars
 * - ราคาที่เก็บจากลูกค้าเป็นราคารวม VAT แล้ว แล้วแตก base/vat ทีหลัง
 * - client ห้ามส่งราคามา server คิดจาก lat/lng + tier + addon เท่านั้น
 */

export type RideServiceType = "RIDE" | "PARCEL" | "LOGISTICS";

export type RideSettings = {
  vatRate: number;
  defaultCommissionRate: number;
  parcelFreeWeightKg: number;
  parcelWeightFeePerKg: number;
  requestTtlMinutes: number;
  searchRadiusKm: number;
};

const DEFAULT_SETTINGS: RideSettings = {
  vatRate: 7,
  defaultCommissionRate: 20,
  parcelFreeWeightKg: 5,
  parcelWeightFeePerKg: 10,
  requestTtlMinutes: 10,
  searchRadiusKm: 15,
};

/** ค่าธรรมเนียมตามขนาดพัสดุ (บาท) — แก้ผ่าน PlatformSetting ได้ */
const DEFAULT_PARCEL_SIZE_FEE: Record<"S" | "M" | "L" | "XL", number> = {
  S: 0,
  M: 20,
  L: 50,
  XL: 120,
};

const SETTING_KEYS = [
  "vat_rate",
  "ride_default_commission_rate",
  "ride_parcel_free_weight_kg",
  "ride_parcel_weight_fee_per_kg",
  "ride_request_ttl_minutes",
  "ride_search_radius_km",
  "ride_parcel_size_fee_s",
  "ride_parcel_size_fee_m",
  "ride_parcel_size_fee_l",
  "ride_parcel_size_fee_xl",
];

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** อ่านกติกาการคิดเงินจาก PlatformSetting (มีค่า default ถ้ายังไม่ตั้ง) */
export async function getRideSettings(): Promise<RideSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_KEYS } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    vatRate: toNumber(map.get("vat_rate"), DEFAULT_SETTINGS.vatRate),
    defaultCommissionRate: toNumber(
      map.get("ride_default_commission_rate"),
      DEFAULT_SETTINGS.defaultCommissionRate,
    ),
    parcelFreeWeightKg: toNumber(
      map.get("ride_parcel_free_weight_kg"),
      DEFAULT_SETTINGS.parcelFreeWeightKg,
    ),
    parcelWeightFeePerKg: toNumber(
      map.get("ride_parcel_weight_fee_per_kg"),
      DEFAULT_SETTINGS.parcelWeightFeePerKg,
    ),
    requestTtlMinutes: toNumber(
      map.get("ride_request_ttl_minutes"),
      DEFAULT_SETTINGS.requestTtlMinutes,
    ),
    searchRadiusKm: toNumber(map.get("ride_search_radius_km"), DEFAULT_SETTINGS.searchRadiusKm),
  };
}

export async function getParcelSizeFee(): Promise<Record<"S" | "M" | "L" | "XL", number>> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: SETTING_KEYS.filter((key) => key.startsWith("ride_parcel_size_fee_")) } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    S: toNumber(map.get("ride_parcel_size_fee_s"), DEFAULT_PARCEL_SIZE_FEE.S),
    M: toNumber(map.get("ride_parcel_size_fee_m"), DEFAULT_PARCEL_SIZE_FEE.M),
    L: toNumber(map.get("ride_parcel_size_fee_l"), DEFAULT_PARCEL_SIZE_FEE.L),
    XL: toNumber(map.get("ride_parcel_size_fee_xl"), DEFAULT_PARCEL_SIZE_FEE.XL),
  };
}

export type LatLng = { lat: number; lng: number };

/** ระยะทางเส้นตรง (กม.) — ปัดทศนิยม 2 ตำแหน่ง */
export function haversineKm(from: LatLng, to: LatLng): number {
  const earthRadiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusKm * c * 100) / 100;
}

/** เวลาเดินทางโดยประมาณ (นาที) — รถเมืองช้ากว่ารถบรรทุกทางไกล */
export function estimateDurationMin(distanceKm: number, serviceType: RideServiceType): number {
  const avgSpeedKmh = serviceType === "LOGISTICS" ? 45 : serviceType === "PARCEL" ? 30 : 25;
  return Math.max(5, Math.round((distanceKm / avgSpeedKmh) * 60));
}

/** แคตตาล็อก addon ที่ขายได้ — front ใช้แสดงตัวเลือก, server ใช้ตรวจราคา */
export const RIDE_ADDON_CATALOG = [
  {
    type: "INSURANCE",
    name: "ประกันอุบัติเหตุ",
    amount: 30,
    services: ["RIDE", "PARCEL", "LOGISTICS"] as RideServiceType[],
    description: "คุ้มครองผู้โดยสารและสินค้าระหว่างเดินทาง",
  },
  {
    type: "CHILD_SEAT",
    name: "คาร์ซีทเด็ก",
    amount: 100,
    services: ["RIDE"] as RideServiceType[],
    description: "ที่นั่งนิรภัยสำหรับเด็กเล็ก",
  },
  {
    type: "VIP_ESCORT",
    name: "พนักงานต้อนรับ / VIP escort",
    amount: 500,
    services: ["RIDE", "LOGISTICS"] as RideServiceType[],
    description: "มีพนักงานดูแลตลอดเส้นทาง",
  },
  {
    type: "EXTRA_STOP",
    name: "จุดแวะเพิ่ม",
    amount: 50,
    services: ["RIDE", "PARCEL"] as RideServiceType[],
    description: "แวะรับ/ส่งเพิ่มระหว่างทาง",
  },
  {
    type: "LOADING",
    name: "บริการยกของขึ้น-ลง",
    amount: 200,
    services: ["PARCEL", "LOGISTICS"] as RideServiceType[],
    description: "ทีมงานช่วยยกของขึ้นและลงรถ",
  },
  {
    type: "WAITING",
    name: "รอระหว่างทาง (15 นาที)",
    amount: 50,
    services: ["RIDE", "PARCEL", "LOGISTICS"] as RideServiceType[],
    description: "เวลารอเพิ่มเติมนอกเหนือจากที่รวมในราคา",
  },
];

export type RideAddonInput = { type: string; qty?: number };

/** รวมราคา addon จากแคตตาล็อก (ไม่เชื่อราคาที่ client ส่งมา) */
export function priceAddons(
  serviceType: RideServiceType,
  addons: RideAddonInput[] | undefined,
): { type: string; name: string; amount: number; qty: number }[] {
  if (!addons || addons.length === 0) {
    return [];
  }

  const result: { type: string; name: string; amount: number; qty: number }[] = [];
  for (const addon of addons) {
    const code = String(addon.type ?? "").toUpperCase();
    const item = RIDE_ADDON_CATALOG.find((entry) => entry.type === code);
    if (!item || !item.services.includes(serviceType)) {
      throw new Error(`addon ${code} ใช้กับบริการนี้ไม่ได้`);
    }

    const qty = Math.max(1, Math.min(10, Math.round(Number(addon.qty) || 1)));
    result.push({ type: item.type, name: item.name, amount: item.amount * qty, qty });
  }

  return result;
}

export type RideTierLike = {
  code: string;
  serviceType: string;
  baseFare: number;
  perKm: number;
  perMin: number;
  minFare: number;
  flatFare: number | null;
  includedKm: number | null;
};

export type RideQuote = {
  fare: number;
  addonTotal: number;
  baseAmount: number;
  vatAmount: number;
  vatRate: number;
  totalFare: number;
  commissionRate: number;
  commission: number;
  netToDriver: number;
  parcelSizeFee: number;
  parcelWeightFee: number;
};

/**
 * คิดค่าโดยสาร
 * RIDE       = max(minFare, baseFare + km×perKm + min×perMin)
 * PARCEL     = สูตร RIDE + ค่าขนาด + ค่าน้ำหนักส่วนเกิน
 * LOGISTICS  = flatFare + (km − includedKm) × perKm (ไม่ต่ำกว่า minFare)
 * addonTotal = Σ addon
 * vat        = round((fare + addonTotal) × vatRate / 100)
 * commission = round(fare × rate / 100)  → netToDriver = fare − commission
 */
export function quoteRideFare(params: {
  tier: RideTierLike;
  distanceKm: number;
  durationMin: number;
  serviceType: RideServiceType;
  addons?: RideAddonInput[];
  parcel?: { weightKg?: number; sizeTier?: "S" | "M" | "L" | "XL" } | null;
  settings: RideSettings;
  parcelSizeFee?: Record<"S" | "M" | "L" | "XL", number>;
  commissionRate?: number | null;
}): RideQuote {
  const { tier, distanceKm, durationMin, serviceType, settings } = params;
  const sizeFees = params.parcelSizeFee ?? DEFAULT_PARCEL_SIZE_FEE;

  let fare: number;
  if (serviceType === "LOGISTICS") {
    const flatFare = tier.flatFare ?? tier.minFare;
    const includedKm = tier.includedKm ?? 0;
    const extraKm = Math.max(0, distanceKm - includedKm);
    fare = Math.max(tier.minFare, Math.round(flatFare + extraKm * tier.perKm));
  } else {
    fare = Math.round(tier.baseFare + distanceKm * tier.perKm + durationMin * tier.perMin);
    fare = Math.max(tier.minFare, fare);
  }

  let parcelSizeFee = 0;
  let parcelWeightFee = 0;
  if (serviceType === "PARCEL" && params.parcel) {
    const sizeTier = params.parcel.sizeTier ?? "S";
    parcelSizeFee = sizeFees[sizeTier] ?? 0;
    const weightKg = Math.max(0, Number(params.parcel.weightKg) || 0);
    const extraWeight = Math.max(0, weightKg - settings.parcelFreeWeightKg);
    parcelWeightFee = Math.round(extraWeight * settings.parcelWeightFeePerKg);
    fare += parcelSizeFee + parcelWeightFee;
  }

  const addons = priceAddons(serviceType, params.addons);
  const addonTotal = addons.reduce((sum, addon) => sum + addon.amount, 0);

  const baseAmount = fare + addonTotal;
  const vatAmount = Math.round((baseAmount * settings.vatRate) / 100);
  const totalFare = baseAmount + vatAmount;

  const commissionRate = params.commissionRate ?? settings.defaultCommissionRate;
  const commission = Math.round((fare * commissionRate) / 100);
  const netToDriver = fare - commission;

  return {
    fare,
    addonTotal,
    baseAmount,
    vatAmount,
    vatRate: settings.vatRate,
    totalFare,
    commissionRate,
    commission,
    netToDriver,
    parcelSizeFee,
    parcelWeightFee,
  };
}

/** เลขอ้างอิงงาน เช่น RD-8KQ4M2 */
export function makeRideRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RD-${tail}`;
}

/** OTP 6 หลักสำหรับยืนยันรับ/ส่งพัสดุ */
export function makeOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
