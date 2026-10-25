import prisma from "../lib/prismaClient";
import { isReadyToPublish, missingToPublish } from "./payout.services";
import { notifyHost } from "./mailer";

// ---------- คิวตรวจประกาศที่พัก ----------

// ลิสต์ประกาศตามสถานะ + แบ่งหน้า (คิวตรวจของแอดมิน)
export async function listStaysForReview(status: string, page: number, size: number) {
  const where = status === "ALL" ? {} : { status: status as any };
  const skip = (page - 1) * size;

  const [items, total] = await Promise.all([
    prisma.stay.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: size,
      select: {
        id: true,
        name: true,
        propertyType: true,
        status: true,
        currentStep: true,
        location: true,
        pricePerNight: true,
        createdAt: true,
        reviewedAt: true,
        rejectedReason: true,
        host: { select: { id: true, userId: true, displayName: true, status: true, user: { select: { email: true } } } },
      },
    }),
    prisma.stay.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

// ดูประกาศเต็มก่อนตัดสินใจ (ร่างก็อ่านได้ ไม่ต้อง PUBLISHED)
export async function getStayForReview(stayId: string) {
  return await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      photos: true,
      roomTypes: { include: { beds: true } },
      amenities: true,
      policy: true,
      nearby: true,
      wholeProperty: true,
      uniqueDetail: true,
      host: { select: { id: true, userId: true, displayName: true, status: true, accountType: true, user: { select: { name: true, email: true } } } },
    },
  });
}

// เงื่อนไขขั้นต่ำของประกาศ (ใช้ตอนอนุมัติ รวมถึงปุ่มอนุมัติทั้งหมด)
export async function stayIssue(stayId: string): Promise<string | null> {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      photos: { select: { id: true } },
      roomTypes: { select: { id: true } },
    },
  });

  if (!stay) {
    return "ไม่พบประกาศ";
  }
  if (stay.photos.length < 1) {
    return "ไม่มีรูปภาพ";
  }
  if (stay.pricePerNight <= 0) {
    return "ราคาไม่ถูกต้อง";
  }

  const missing = await missingToPublish(stay.hostId);
  return missing === "" ? null : missing;
}

// อนุมัติ → PUBLISHED (คืนข้อความถ้าอนุมัติไม่ได้)
export async function approveStayService(stayId: string, actorId: string) {
  const issue = await stayIssue(stayId);
  if (issue !== null) {
    throw new Error(`อนุมัติไม่ได้: ${issue}`);
  }

  const stay = await prisma.stay.update({
    where: { id: stayId },
    data: { status: "PUBLISHED", reviewedBy: actorId, reviewedAt: new Date(), rejectedReason: null },
  });

  await prisma.moderationLog.create({ data: { actorId, action: "APPROVE", stayId } });

  const host = await prisma.hostProfile.findUnique({
    where: { id: stay.hostId ?? "" },
    include: { user: true },
  });
  if (host) {
    await notifyHost(host.user.email, "ประกาศของคุณได้รับอนุมัติแล้ว", `ที่พัก "${stay.name}" ขึ้นเว็บเรียบร้อย`);
  }

  return stay;
}

// ตีกลับ → REJECTED พร้อมเหตุผล (เจ้าของแก้แล้วส่งใหม่ได้)
export async function rejectStayService(stayId: string, actorId: string, reason: string) {
  const stay = await prisma.stay.update({
    where: { id: stayId },
    data: { status: "REJECTED", reviewedBy: actorId, reviewedAt: new Date(), rejectedReason: reason },
  });

  await prisma.moderationLog.create({ data: { actorId, action: "REJECT", stayId, reason } });

  const host = await prisma.hostProfile.findUnique({
    where: { id: stay.hostId ?? "" },
    include: { user: true },
  });
  if (host) {
    await notifyHost(
      host.user.email,
      "ประกาศของคุณถูกตีกลับ",
      `ที่พัก "${stay.name}" ถูกตีกลับ: ${reason}`,
    );
  }

  return stay;
}

// อนุมัติทั้งหมดในคิว — ข้ามรายการที่ยังไม่ผ่าน แล้วสรุปให้แอดมิน
export async function approveAllService(actorId: string, status = "PENDING_REVIEW") {
  const queue = await prisma.stay.findMany({
    where: { status: status as any },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const approved: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const item of queue) {
    try {
      await approveStayService(item.id, actorId);
      approved.push(item.name);
    } catch (error: any) {
      skipped.push({ name: item.name, reason: error.message });
    }
  }

  return { total: queue.length, approved, skipped };
}

// ส่งประกาศเข้าคิวตรวจใหม่ (เจ้าของกดหลังแก้จาก REJECTED)
export async function resubmitStayService(stayId: string, userId: string) {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { host: true },
  });

  if (!stay) {
    throw new Error("Property not found");
  }
  if (!stay.host || stay.host.userId !== userId) {
    throw new Error("Not your property");
  }
  if (stay.status !== "REJECTED" && stay.status !== "DRAFT") {
    throw new Error("Cannot resubmit");
  }

  return await prisma.stay.update({
    where: { id: stayId },
    data: { status: "PENDING_REVIEW", rejectedReason: null },
  });
}

// ---------- คิวตรวจเจ้าของที่พัก (Partner) ----------

export async function listHostsForReview(status: string, page: number, size: number) {
  const where = status === "ALL" ? {} : { status };
  const skip = (page - 1) * size;

  const [items, total] = await Promise.all([
    prisma.hostProfile.findMany({
      where,
      orderBy: { id: "asc" },
      skip,
      take: size,
      include: {
        user: { select: { id: true, name: true, email: true } },
        stays: { select: { id: true, name: true, status: true } },
        payoutAccount: { select: { id: true, status: true, bankName: true } },
      },
    }),
    prisma.hostProfile.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

// ยืนยันเจ้าของ → VERIFIED + ให้สิทธิ์ OWNER
export async function verifyHostService(hostId: string, actorId: string) {
  const host = await prisma.hostProfile.update({
    where: { id: hostId },
    data: { status: "VERIFIED", verifiedAt: new Date(), rejectedReason: null },
  });

  await prisma.user.update({ where: { id: host.userId }, data: { role: "OWNER" } });
  await prisma.moderationLog.create({ data: { actorId, action: "VERIFY_HOST", hostId } });

  return host;
}

// ตีกลับเจ้าของ พร้อมเหตุผล
export async function rejectHostService(hostId: string, actorId: string, reason: string) {
  const host = await prisma.hostProfile.update({
    where: { id: hostId },
    data: { status: "REJECTED", rejectedReason: reason },
  });

  await prisma.moderationLog.create({ data: { actorId, action: "REJECT_HOST", hostId, reason } });

  return host;
}

// เอกสารยืนยันตัวตนของเจ้าของ (สำหรับหน้า admin)
export async function getHostDocuments(userId: string) {
  return await prisma.verificationDocument.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

// ประวัติการตรวจ (audit)
export async function listModerationLogs(page: number, size: number) {
  const skip = (page - 1) * size;
  const [items, total] = await Promise.all([
    prisma.moderationLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: size }),
    prisma.moderationLog.count(),
  ]);
  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}