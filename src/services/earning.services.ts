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
    create: {
      bookingId,
      stayId,
      status: "PENDING",
      grossAmount: money.gross,
      commission: money.commission,
      netAmount: money.net,
    },
    update: {
      grossAmount: money.gross,
      commission: money.commission,
      netAmount: money.net,
    },
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
  const stays = await prisma.stay.findMany({
    where: { hostId },
    select: { id: true },
  });
  const stayIds = stays.map((stay) => stay.id);
  if (stayIds.length === 0) {
    return { gross: 0, commission: 0, net: 0, count: 0 };
  }

  const rows = await prisma.ownerEarning.findMany({
    where: { stayId: { in: stayIds }, status: { in: ["PENDING", "AVAILABLE", "PAID"] } },
    select: { grossAmount: true, commission: true, netAmount: true },
  });

  const gross = rows.reduce((sum, row) => sum + row.grossAmount, 0);
  const commission = rows.reduce((sum, row) => sum + row.commission, 0);

  return { gross, commission, net: rows.reduce((sum, row) => sum + row.netAmount, 0), count: rows.length };
}