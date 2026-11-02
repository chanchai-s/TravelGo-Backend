import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "./prismaClient";

/**
 * Realtime ของ ride (tracking + chat + SOS)
 * - client ส่ง token มาตอน connect (auth.token หรือ query.token)
 * - ทุกคนเข้า room ของตัวเอง `user:{id}`, แอดมินเข้า `admins`
 * - เข้า room ของงานได้ก็ต่อเมื่อเป็น rider / driver ของงานนั้น
 * - ถ้ายังไม่ init (เช่นตอนรัน test) emit จะเป็น no-op ไม่ทำให้ request พัง
 */

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4000",
];

let io: Server | null = null;

export function initRideSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: CORS_ORIGINS, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const authToken = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as
        | string
        | undefined;
      const token = authToken?.replace(/^Bearer\s+/i, "");
      if (!token) {
        return next(new Error("ต้องเข้าสู่ระบบก่อน"));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET as string, {
        algorithms: ["HS256"],
      }) as { id: string };

      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, name: true, role: true },
      });
      if (!user) {
        return next(new Error("ไม่พบผู้ใช้"));
      }

      socket.data.userId = user.id;
      socket.data.userName = user.name;
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error("token ไม่ถูกต้อง"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.data.userId ?? "");
    const role = String(socket.data.role ?? "USER");
    socket.join(`user:${userId}`);
    if (role === "ADMIN") {
      socket.join("admins");
    }

    socket.on("job:join", async (jobId: string, ack?: (result: unknown) => void) => {
      try {
        const job = await prisma.rideJob.findUnique({
          where: { id: String(jobId ?? "") },
          select: { id: true, riderId: true, driverId: true },
        });
        const allowed =
          job && (job.riderId === userId || job.driverId === userId || role === "ADMIN");
        if (!allowed || !job) {
          ack?.({ ok: false, message: "ไม่มีสิทธิ์ดูงานนี้" });
          return;
        }
        socket.join(`job:${job.id}`);
        ack?.({ ok: true });
      } catch (error: any) {
        ack?.({ ok: false, message: String(error?.message ?? "join ไม่สำเร็จ") });
      }
    });

    socket.on("job:leave", (jobId: string) => {
      socket.leave(`job:${String(jobId ?? "")}`);
    });

    // คนขับส่งพิกัดระหว่างทำงาน — บันทึกแล้วกระจายให้ rider ที่อยู่ในห้องงาน
    socket.on("driver:location", async (payload: any) => {
      try {
        const jobId = String(payload?.jobId ?? "");
        const lat = Number(payload?.lat);
        const lng = Number(payload?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return;
        }

        const job = await prisma.rideJob.findUnique({
          where: { id: jobId },
          select: { id: true, driverId: true, status: true },
        });
        if (!job || job.driverId !== userId) {
          return;
        }

        await prisma.driverLocation.create({
          data: {
            driverId: userId,
            jobId: job.id,
            lat,
            lng,
            bearing: Number.isFinite(Number(payload?.bearing)) ? Number(payload.bearing) : null,
            speed: Number.isFinite(Number(payload?.speed)) ? Number(payload.speed) : null,
          },
        });
        await prisma.driverProfile.updateMany({
          where: { userId },
          data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
        });

        const update = { jobId: job.id, lat, lng, at: new Date().toISOString() };
        io?.to(`job:${job.id}`).emit("job:location", update);
      } catch (error) {
        console.error("[rideSocket] บันทึกพิกัดไม่สำเร็จ:", (error as Error).message);
      }
    });
  });

  return io;
}

export function getRideSocket(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToJob(jobId: string, event: string, payload: unknown) {
  io?.to(`job:${jobId}`).emit(event, payload);
}

export function emitToAdmins(event: string, payload: unknown) {
  io?.to("admins").emit(event, payload);
}
