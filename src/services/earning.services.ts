import prisma from "../lib/prismaClient";

/**
 * รายได้เจ้าของ + ค่าคอมมิชชัน
 * คิดตอนจองสำเร็จทันที (ไม่รอจ่ายเงินจริง) และยกเลิกรายการนี้เมื่อผู้ใช้ยกเลิกการจอง
 */

// อัตราคอมมิชชันเป็น % — ตั้งใน .env ได้ (ค่าเริ่มต้น 0 = ยังไม่หัก)
export function commissionRate(): number {
  const value = Number(process.env.COMMISSION_RATE);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
}

// แยกตัวเลขยอดขาย → คอมมิชชัน → สุทธิที่เจ้าของได้
export function splitMoney(gross: number) {
  const rate = commissionRate();
  const commission = Math.round(gross * (rate / 100));
  return { gross, commissionRate: rate, commission, net: gross - commission };
}

/** สร้างรายการรายได้ตอนจองสำเร็จ (ถ้ามีเจ้าของแล้วเท่านั้น) */
export async function createEarningForBooking(bookingId: string, stayId: string, gross: number) {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    select: { hostId: true },
  });
  if (!stay || !stay.hostId) {
    return null;
  }

  const money = splitMoney(gross);

  return await prisma.ownerEarning.upsert({
    where: { bookingId },
    create: { bookingId, stayId, hostId: stay.hostId, status: "PENDING", ...money },
    update: money,
  });
}

/** ยกเลิกรายการรายได้เมื่อผู้ใช้ยกเลิกการจอง (เก็บประวัติไว้ แต่ไม่นับในยอด) */
export async function voidEarningForBooking(bookingId: string) {
  return await prisma.ownerEarning.updateMany({
    where: { bookingId, status: { not: "VOID" } },
    data: { status: "VOID" },
  });
}

/** ยอดรวมของเจ้าของจากรายการรายได้ที่ยังนับอยู่ */
export async function ownerEarningsSummary(hostId: string) {
  const rows = await prisma.ownerEarning.findMany({
    where: { hostId, status: { in: ["PENDING", "AVAILABLE", "PAID"] } },
    select: { gross: true, commission: true, net: true },
  });

  const gross = rows.reduce((sum, row) => sum + row.gross, 0);
  const commission = rows.reduce((sum, row) => sum + row.commission, 0);

  return { gross, commission, net: rows.reduce((sum, row) => sum + row.net, 0), count: rows.length };
}