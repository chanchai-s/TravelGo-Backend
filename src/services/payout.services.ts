import prisma from "../lib/prismaClient";
import { commissionRate } from "./earning.services";
import { createConnectOnboardingLink, stripeEnabled, transferToHost } from "../lib/stripe";

// ---------- บัญชีรับเงิน + สัญญา ----------

// ซ่อนเลขบัญชีเหลือ 4 หลักท้าย แสดงผลให้เจ้าของเห็น
export function maskAccount(number: string): string {
  const clean = number.replace(/\D/g, "");
  return clean.length <= 4 ? "*".repeat(clean.length) : "*".repeat(clean.length - 4) + clean.slice(-4);
}

// เก็บเลขบัญชีเป็นตัวเลขล้วน (ตัดขีด/ช่องว่างออก)
function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** บันทึก/แก้บัญชีรับเงิน (สร้างใหม่ทุกครั้ง = แก้ทับของเดิม และต้องรอตรวจใหม่) */
export async function savePayoutService(hostId: string, data: any) {
  return await prisma.payoutAccount.upsert({
    where: { hostId },
    create: {
      hostId,
      bankName: String(data.bankName ?? "").trim(),
      accountHolder: String(data.accountHolder ?? "").trim(),
      accountNumber: onlyDigits(data.accountNumber),
      status: "PENDING",
    },
    update: {
      bankName: String(data.bankName ?? "").trim(),
      accountHolder: String(data.accountHolder ?? "").trim(),
      accountNumber: onlyDigits(data.accountNumber),
      status: "PENDING",
      verifiedAt: null,
      rejectedReason: null,
    },
  });
}

/** อ่านบัญชีรับเงินของเจ้าของ (คืนเลขที่ปิดบัง) + สถานะสัญญา */
export async function getPayoutService(hostId: string) {
  const [payout, host] = await Promise.all([
    prisma.payoutAccount.findUnique({ where: { hostId } }),
    prisma.hostProfile.findUnique({ where: { id: hostId } }),
  ]);

  return {
    payout: payout
      ? {
          id: payout.id,
          bankName: payout.bankName,
          accountHolder: payout.accountHolder,
          accountNumberMasked: maskAccount(payout.accountNumber),
          status: payout.status,
          stripeAccountId: payout.stripeAccountId,
          rejectedReason: payout.rejectedReason,
          verifiedAt: payout.verifiedAt,
        }
      : null,
    contractVersion: host?.contractVersion ?? null,
    contractAcceptedAt: host?.contractAcceptedAt ?? null,
  };
}

/** ยอมรับข้อกำหนดของแพลตฟอร์ม */
export async function acceptContractService(hostId: string, version: string) {
  return await prisma.hostProfile.update({
    where: { id: hostId },
    data: { contractVersion: version, contractAcceptedAt: new Date() },
  });
}

/** เจ้าของพร้อมเผยแพร่หรือยัง (ใช้บังคับตอนอนุมัติประกาศ) */
export async function isReadyToPublish(hostId: string | null): Promise<boolean> {
  if (!hostId) {
    return false;
  }
  const host = await prisma.hostProfile.findUnique({
    where: { id: hostId },
    include: { payoutAccount: true },
  });
  if (!host) {
    return false;
  }
  return host.contractAcceptedAt !== null && host.payoutAccount?.status === "VERIFIED";
}

/** ข้อความบอกเจ้าของยังขาดอะไร */
export async function missingToPublish(hostId: string | null): Promise<string> {
  if (!hostId) {
    return "ประกาศนี้ยังไม่มีเจ้าของ";
  }
  const host = await prisma.hostProfile.findUnique({
    where: { id: hostId },
    include: { payoutAccount: true },
  });
  const missing: string[] = [];
  if (!host?.contractAcceptedAt) {
    missing.push("ยังไม่ได้ยอมรับข้อกำหนด");
  }
  if (host?.payoutAccount?.status !== "VERIFIED") {
    missing.push("บัญชีรับเงินยังไม่ผ่านการตรวจ");
  }
  return missing.join(" / ");
}

/** แอดมินตรวจบัญชีรับเงิน */
export async function verifyPayoutService(hostId: string, actorId: string, approve: boolean, reason: string) {
  const payout = await prisma.payoutAccount.update({
    where: { hostId },
    data: approve
      ? { status: "VERIFIED", verifiedAt: new Date(), rejectedReason: null }
      : { status: "REJECTED", rejectedReason: reason },
  });

  await prisma.moderationLog.create({
    data: {
      adminId: actorId,
      targetType: "PAYOUT_ACCOUNT",
      targetId: hostId,
      action: approve ? "VERIFY_PAYOUT" : "REJECT_PAYOUT",
      reason: approve ? null : reason,
    },
  });

  return payout;
}

// ---------- ระบบจ่ายเงินออกให้เจ้าของ (Stripe Transfer) ----------

/**
 * เงินที่ "พร้อมจ่าย" = รายได้สุทธิของการจองที่เข้าพักเสร็จแล้ว
 * และยังไม่ถูกผูกไว้กับคิวจ่ายที่ยังดำเนินการอยู่ (กันจ่ายซ้ำ)
 */
async function availableEarnings(hostId: string) {
  const inFlight = await prisma.payoutItem.findMany({
    where: { payout: { hostId, status: "PENDING" } },
    select: { bookingId: true },
  });
  const taken = new Set(inFlight.map((item) => item.bookingId));

  const stays = await prisma.stay.findMany({ where: { hostId }, select: { id: true } });
  const stayIds = stays.map((stay) => stay.id);
  if (stayIds.length === 0) {
    return [];
  }

  const rows = await prisma.ownerEarning.findMany({
    where: { stayId: { in: stayIds }, status: { in: ["PENDING", "AVAILABLE"] } },
    select: {
      id: true,
      netAmount: true,
      bookingId: true,
      booking: { select: { status: true, checkOut: true } },
    },
  });

  return rows.filter((row) => {
    if (taken.has(row.bookingId)) {
      return false;
    }
    const done =
      row.booking.status === "COMPLETED" ||
      (row.booking.checkOut !== null && row.booking.checkOut.getTime() < Date.now());
    return done;
  });
}

/** สรุปยอดของเจ้าของ: พร้อมจ่าย / รอครบกำหนด / กำลังจ่าย */
export async function payoutBalanceService(userId: string) {
  const host = await prisma.hostProfile.findUnique({
    where: { userId },
    include: { payoutAccount: true },
  });

  if (!host) {
    throw new Error("ยังไม่ได้สมัครเป็นเจ้าของที่พัก");
  }

  const stays = await prisma.stay.findMany({
    where: { hostId: host.id },
    select: { id: true },
  });
  const stayIdsOfHost = stays.map((stay) => stay.id);

  const all = await prisma.ownerEarning.findMany({
    where: { stayId: { in: stayIdsOfHost }, status: { in: ["PENDING", "AVAILABLE", "PAID"] } },
    select: { netAmount: true },
  });

  const ready = await availableEarnings(host.id);
  const readyAmount = ready.reduce((sum, row) => sum + row.netAmount, 0);
  const totalNet = all.reduce((sum, row) => sum + row.netAmount, 0);

  const processing = await prisma.payout.aggregate({
    where: { hostId: host.id, status: "PENDING" },
    _sum: { amount: true },
  });

  return {
    payoutReady: readyAmount,
    payoutPending: Math.max(0, totalNet - readyAmount),
    payoutInFlight: processing._sum?.amount ?? 0,
    bankVerified: host.payoutAccount?.status === "VERIFIED",
    stripeConnected: Boolean(host.payoutAccount?.stripeAccountId),
    stripeEnabled: stripeEnabled(),
    commissionRate: commissionRate(),
  };
}

/** เจ้าของกดขอจ่ายเงิน */
export async function requestPayoutService(userId: string, _note?: string) {
  const host = await prisma.hostProfile.findUnique({
    where: { userId },
    include: { payoutAccount: true },
  });
  if (!host) {
    throw new Error("ยังไม่ได้สมัครเป็นเจ้าของที่พัก");
  }
  if (host.payoutAccount?.status !== "VERIFIED") {
    throw new Error("บัญชีรับเงินยังไม่ผ่านการตรวจ");
  }

  const ready = await availableEarnings(host.id);
  if (ready.length === 0) {
    const pending = await prisma.payout.findFirst({
      where: { hostId: host.id, status: "PENDING" },
      select: { id: true },
    });
    throw new Error(
      pending !== null ? "มีคำขอจ่ายเงินที่ยังอยู่ระหว่างดำเนินการ" : "ยังไม่มียอดที่พร้อมจ่าย",
    );
  }

  const amount = ready.reduce((sum, row) => sum + row.netAmount, 0);

  return await prisma.payout.create({
    data: {
      hostId: host.id,
      amount,
      status: "PENDING",
      items: {
        create: ready.map((row) => ({ bookingId: row.bookingId, amount: row.netAmount })),
      },
    },
  });
}

/** ประวัติการจ่ายของเจ้าของ */
export async function listHostPayoutsService(userId: string) {
  const host = await prisma.hostProfile.findUnique({ where: { userId } });
  if (!host) {
    return [];
  }
  return await prisma.payout.findMany({
    where: { hostId: host.id },
    orderBy: { requestedAt: "desc" },
  });
}

/** ลิงก์เชื่อมบัญชี Stripe Connect (คืน null ถ้ายังไม่ตั้ง key) */
export async function connectOnboardingService(userId: string) {
  const host = await prisma.hostProfile.findUnique({ where: { userId } });
  if (!host) {
    throw new Error("ยังไม่ได้สมัครเป็นเจ้าของที่พัก");
  }
  const url = await createConnectOnboardingLink(userId);
  if (url === null) {
    throw new Error("ยังไม่ได้ตั้งค่า Stripe (STRIPE_SECRET_KEY)");
  }
  return url;
}

/** แอดมินบันทึกเลขบัญชี Stripe Connect ของเจ้าของ */
export async function saveStripeAccountService(hostId: string, stripeAccountId: string) {
  return await prisma.payoutAccount.update({
    where: { hostId },
    data: { stripeAccountId: stripeAccountId.trim() === "" ? null : stripeAccountId.trim() },
  });
}

/** แอดมินดูคิวจ่ายทั้งหมด */
export async function listAllPayoutsService(status: string) {
  return await prisma.payout.findMany({
    where: status === "ALL" ? {} : { status: status as any },
    orderBy: { requestedAt: "desc" },
    include: { items: { select: { id: true, amount: true } } },
  });
}

/**
 * แอดมินสั่งจ่าย — ยิง Stripe Transfer ถ้าเป็นโหมดจริง ไม่งั้นจำลองผล
 * เมื่อสำเร็จ: รายการรายได้ในคิวนี้ถูกทำเครื่องหมายว่าจ่ายแล้ว
 */
export async function sendPayoutService(payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { items: true, host: { include: { payoutAccount: true } } },
  });

  if (!payout) {
    throw new Error("Payout not found");
  }
  if (payout.status !== "PENDING") {
    throw new Error("รายการนี้จ่ายไปแล้วหรือกำลังดำเนินการ");
  }

  const accountId = payout.host.payoutAccount?.stripeAccountId ?? null;

  const result = await transferToHost(
    payout.amount,
    accountId,
    `WanderGo payout ${payout.id}`,
  );

  if (!result.ok) {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "REJECTED", processedAt: new Date() },
    });
    throw new Error(result.message ?? "โอนเงินไม่สำเร็จ");
  }

  const paid = await prisma.payout.update({
    where: { id: payoutId },
    data: { status: "VERIFIED", processedAt: new Date() },
  });

  await prisma.ownerEarning.updateMany({
    where: { bookingId: { in: payout.items.map((item) => item.bookingId) } },
    data: { status: "PAID", paidAt: new Date() },
  });

  return { payout: paid, ref: result.ref ?? null, mock: result.mock };
}

/** แอดมินปฏิเสธคิวจ่าย (ปลดรายการรายได้ให้จ่ายรอบหน้า) */
export async function rejectPayoutService(payoutId: string, _reason: string) {
  return await prisma.payout.update({
    where: { id: payoutId },
    data: { status: "REJECTED", processedAt: new Date() },
  });
}