import prisma from "../lib/prismaClient";
import { text } from "./rideFare.services";
import { emitToJob } from "../lib/rideRealtime";

/**
 * แชทในงาน (rider ↔ driver) — เก็บใน DB แล้วส่งต่อผ่าน Socket.IO
 * ข้อความถูกจำกัดสิทธิ์เฉพาะ rider / driver ของงานนั้น (+ admin)
 */

type Viewer = { userId: string; role?: string | null };

async function loadJobForChat(jobId: string, viewer: Viewer) {
  const job = await prisma.rideJob.findUnique({
    where: { id: text(jobId) },
    select: { id: true, riderId: true, driverId: true, status: true, ref: true },
  });
  if (!job) {
    throw new Error("ไม่พบงานนี้");
  }
  if (
    viewer.role !== "ADMIN" &&
    viewer.userId !== job.riderId &&
    viewer.userId !== job.driverId
  ) {
    throw new Error("ไม่มีสิทธิ์ดูแชทของงานนี้");
  }
  return job;
}

export async function listJobMessagesService(jobId: string, viewer: Viewer) {
  const job = await loadJobForChat(jobId, viewer);

  const messages = await prisma.rideMessage.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // เปิดอ่านแล้ว = mark read ข้อความของอีกฝ่าย
  await prisma.rideMessage.updateMany({
    where: { jobId: job.id, senderId: { not: viewer.userId }, readAt: null },
    data: { readAt: new Date() },
  });

  return { jobId: job.id, ref: job.ref, messages };
}

export async function sendJobMessageService(jobId: string, senderId: string, input: any) {
  const job = await loadJobForChat(jobId, { userId: senderId });
  if (["CANCELLED", "EXPIRED"].includes(job.status)) {
    throw new Error("งานนี้ปิดแล้ว ส่งข้อความไม่ได้");
  }

  const body = text(input?.text);
  const attachmentUrl = text(input?.attachmentUrl) || null;
  if (body === "" && !attachmentUrl) {
    throw new Error("ข้อความว่าง");
  }

  const message = await prisma.rideMessage.create({
    data: {
      jobId: job.id,
      senderId,
      text: body || null,
      attachmentUrl,
    },
  });

  const receiverId = job.riderId === senderId ? job.driverId : job.riderId;
  emitToJob(job.id, "chat:message", message);
  return { message, receiverId };
}

export async function unreadMessageCountService(jobId: string, userId: string) {
  return prisma.rideMessage.count({
    where: { jobId: text(jobId), senderId: { not: userId }, readAt: null },
  });
}
