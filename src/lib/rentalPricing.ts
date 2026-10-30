import prisma from "./prismaClient";

/** ค่าคงที่ด้านเงิน/เวลาของธุรกิจรถเช่า (แก้ได้ผ่าน PlatformSetting) */
export type RentalSettings = {
  vatRate: number;
  lateFeePerHour: number;
  lateGraceMinutes: number;
  defaultCommissionRate: number;
};

const DEFAULT_SETTINGS: RentalSettings = {
  vatRate: 7,
  lateFeePerHour: 200,
  lateGraceMinutes: 60,
  defaultCommissionRate: 20,
};

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** อ่านกติกาการคิดเงินจาก PlatformSetting (มีค่า default ถ้ายังไม่ตั้ง) */
export async function getRentalSettings(): Promise<RentalSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: {
      key: { in: ["vat_rate", "late_fee_per_hour", "late_grace_minutes", "default_commission_rate"] },
    },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    vatRate: toNumber(map.get("vat_rate"), DEFAULT_SETTINGS.vatRate),
    lateFeePerHour: toNumber(map.get("late_fee_per_hour"), DEFAULT_SETTINGS.lateFeePerHour),
    lateGraceMinutes: toNumber(map.get("late_grace_minutes"), DEFAULT_SETTINGS.lateGraceMinutes),
    defaultCommissionRate: toNumber(
      map.get("default_commission_rate"),
      DEFAULT_SETTINGS.defaultCommissionRate,
    ),
  };
}

/** จำนวนวันเช่า — ปัดขึ้นเป็นวัน (ขั้นต่ำ 1 วัน) */
export function rentalDays(pickupAt: Date, dropoffAt: Date): number {
  const ms = dropoffAt.getTime() - pickupAt.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export type RentalQuote = {
  days: number;
  pricePerDay: number;
  rentalTotal: number;
  baseAmount: number;
  vatAmount: number;
  vatRate: number;
  depositAmount: number;
  commissionRate: number;
  commission: number;
  netToPartner: number;
};

/**
 * ราคาที่เก็บจากลูกค้าเป็น "ราคารวม VAT" แล้ว
 * ฐานค่าคอม = ค่าเช่าก่อน VAT (ไม่รวมมัดจำ) → commission = base × rate
 */
export function quoteRental(params: {
  pricePerDay: number;
  depositAmount: number;
  days: number;
  settings: RentalSettings;
  commissionRate: number | null;
}): RentalQuote {
  const { pricePerDay, depositAmount, days, settings } = params;
  const commissionRate = params.commissionRate ?? settings.defaultCommissionRate;

  const rentalTotal = pricePerDay * days;
  const baseAmount = Math.round((rentalTotal * 100) / (100 + settings.vatRate));
  const vatAmount = rentalTotal - baseAmount;
  const commission = Math.round((baseAmount * commissionRate) / 100);

  return {
    days,
    pricePerDay,
    rentalTotal,
    baseAmount,
    vatAmount,
    vatRate: settings.vatRate,
    depositAmount,
    commissionRate,
    commission,
    netToPartner: baseAmount - commission,
  };
}

/**
 * ค่าคืนช้า — เกิน grace (60 นาที) คิดชั่วโมงละ lateFeePerHour ไม่มีเพดาน
 * ปัดขึ้นเป็นชั่วโมงตามเวลาที่เกิน grace
 */
export function lateFeeFor(
  dropoffAt: Date,
  returnedAt: Date,
  settings: RentalSettings,
): { lateMinutes: number; billableHours: number; lateFee: number } {
  const lateMinutes = Math.max(0, Math.floor((returnedAt.getTime() - dropoffAt.getTime()) / 60000));
  if (lateMinutes <= settings.lateGraceMinutes) {
    return { lateMinutes, billableHours: 0, lateFee: 0 };
  }

  const billableHours = Math.ceil((lateMinutes - settings.lateGraceMinutes) / 60);
  return { lateMinutes, billableHours, lateFee: billableHours * settings.lateFeePerHour };
}

/** สถานะการจองที่ยังกันรถไว้ (ไม่ให้จองทับ) */
export const BLOCKING_RENTAL_STATUSES = ["PENDING_PARTNER", "RESERVED", "PAID", "PICKED_UP"] as const;

/**
 * หารถที่ชนช่วงเวลา — คืน "BOOKED" ถ้ามีการจองทับ, "BLOCKED" ถ้าถูกปิดปฏิทิน, null ถ้าว่าง
 */
export async function findVehicleConflict(
  vehicleId: string,
  pickupAt: Date,
  dropoffAt: Date,
  excludeRentalId?: string,
): Promise<"BOOKED" | "BLOCKED" | null> {
  const booked = await prisma.rentalDetail.findFirst({
    where: {
      vehicleId,
      status: { in: [...BLOCKING_RENTAL_STATUSES] as any },
      pickupAt: { lt: dropoffAt },
      dropoffAt: { gt: pickupAt },
      ...(excludeRentalId ? { id: { not: excludeRentalId } } : {}),
    },
    select: { id: true },
  });
  if (booked) {
    return "BOOKED";
  }

  const blocked = await prisma.vehicleBlock.findFirst({
    where: {
      vehicleId,
      startAt: { lt: dropoffAt },
      endAt: { gt: pickupAt },
    },
    select: { id: true },
  });

  return blocked ? "BLOCKED" : null;
}

/** เลขอ้างอิงการจองรถ เช่น RC-8KQ4M2 */
export function makeRentalRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += chars[Math.floor(Math.random() * chars.length)];
  }
  return `RC-${tail}`;
}
