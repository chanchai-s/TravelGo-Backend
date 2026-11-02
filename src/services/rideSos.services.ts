import prisma from "../lib/prismaClient";
import { text } from "./rideFare.services";
import { emitToAdmins, emitToJob, emitToUser } from "../lib/rideRealtime";

/**
 * Concierge SOS — ผู้โดยสาร/คนขับกดขอความช่วยเหลือระหว่างงาน
 * แอดมินเห็นทันทีผ่าน Socket.IO room `admins` แล้วกดรับเรื่อง/ปิดเรื่องได้
 */

type Viewer = { userId: string; role?: string | null };

async function loadJobForSos(jobId: string, viewer: Viewer) {
  const job = await prisma.rideJob.findUnique({
    where: { id: text(jobId) },
    select: { id: true, ref: true, riderId: true, driverId: true, status: true },
  });
  if (!job) {
    throw new Error("ไม่พบงานนี้");
  }
  if (
    viewer.role !== "ADMIN" &&
    viewer.userId !== job.riderId &&
    viewer.userId !== job.driverId
  ) {
    throw new Error("ไม่มีสิทธิ์แจ้งเหตุของงานนี้");
  }
  return job;
}

export async function createSosService(jobId: string, viewer: Viewer, input: any) {
  const job = await loadJobForSos(jobId, viewer);
  if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(job.status)) {
    throw new Error("งานนี้จบแล้ว แจ้ง SOS ไม่ได้");
  }

  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  const note = text(input?.note) || null;

  const event = await prisma.rideSosEvent.create({
    data: {
      jobId: job.id,
      userId: viewer.userId,
      lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
      lng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
      note,
      status: "OPEN",
    },
  });

  const payload = {
    ...event,
    jobRef: job.ref,
    jobStatus: job.status,
    riderId: job.riderId,
    driverId: job.driverId,
  };

  emitToAdmins("sos:new", payload);
  emitToJob(job.id, "sos:new", payload);
  emitToUser(job.riderId, "sos:status", { jobId: job.id, sosId: event.id, status: "OPEN" });
  if (job.driverId) {
    emitToUser(job.driverId, "sos:status", { jobId: job.id, sosId: event.id, status: "OPEN" });
  }

  return event;
}

export async function listSosService(options: any) {
  const status = text(options?.status).toUpperCase();
  const events = await prisma.rideSosEvent.findMany({
    where: status && status !== "ALL" ? { status: status as any } : {},
    include: {
      job: {
        select: {
          id: true,
          ref: true,
          serviceType: true,
          status: true,
          riderId: true,
          driverId: true,
          pickupAddress: true,
          dropoffAddress: true,
          rider: { select: { id: true, name: true, phone: true } },
          driver: { select: { id: true, name: true, phone: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return { items: events, total: events.length };
}

export async function listJobSosService(jobId: string, viewer: Viewer) {
  const job = await loadJobForSos(jobId, viewer);
  return prisma.rideSosEvent.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateSosStatusService(
  sosId: string,
  adminId: string,
  nextStatus: "ACK" | "CLOSED",
) {
  const event = await prisma.rideSosEvent.findUnique({ where: { id: text(sosId) } });
  if (!event) {
    throw new Error("ไม่พบเหตุ SOS นี้");
  }
  if (event.status === nextStatus) {
    return event;
  }
  if (nextStatus === "ACK" && event.status !== "OPEN") {
    throw new Error("เหตุนี้ถูกรับเรื่องแล้ว");
  }
  if (nextStatus === "CLOSED" && event.status === "CLOSED") {
    return event;
  }

  const updated = await prisma.rideSosEvent.update({
    where: { id: event.id },
    data: {
      status: nextStatus as any,
      handledBy: adminId,
      handledAt: new Date(),
    },
  });

  emitToJob(event.jobId, "sos:status", { jobId: event.jobId, sosId: event.id, status: nextStatus });
  const job = await prisma.rideJob.findUnique({
    where: { id: event.jobId },
    select: { riderId: true, driverId: true },
  });
  if (job) {
    emitToUser(job.riderId, "sos:status", { jobId: event.jobId, sosId: event.id, status: nextStatus });
    if (job.driverId) {
      emitToUser(job.driverId, "sos:status", { jobId: event.jobId, sosId: event.id, status: nextStatus });
    }
  }

  return updated;
}

export async function ackSosService(sosId: string, adminId: string) {
  return updateSosStatusService(sosId, adminId, "ACK");
}

export async function closeSosService(sosId: string, adminId: string) {
  return updateSosStatusService(sosId, adminId, "CLOSED");
}
