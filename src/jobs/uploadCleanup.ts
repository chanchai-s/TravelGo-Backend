import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prismaClient";
import { UPLOAD_DIR } from "../lib/upload";

const HOUR = 60 * 60 * 1000;

// ไฟล์ที่อัปโหลดแล้วยังไม่ถูกใช้ที่ไหนในระบบ และเก่ากว่า TTL ชั่วโมง = ขยะ
// (คนอัปโหลดแล้วไม่บันทึกร่าง / เขียน URL ทิ้ง) ล้างทิ้งเพื่อไม่ให้ดิสก์บวม
export async function cleanupOrphanUploads(): Promise<number> {
  const ttlHours = Number(process.env.UPLOAD_TTL_HOURS);
  const ttl = (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24) * HOUR;
  const deadline = new Date(Date.now() - ttl);

  const usedUrls = await prisma.stayPhoto.findMany({ select: { url: true } });
  const used = new Set(usedUrls.map((item) => item.url));

  const files = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
  let removed = 0;

  for (const name of files) {
    const full = path.join(UPLOAD_DIR, name);
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.mtime.getTime() > deadline.getTime()) {
      continue;
    }
    if (used.has(`/uploads/${name}`)) {
      continue;
    }
    fs.unlinkSync(full);
    removed += 1;
  }

  return removed;
}

/** ล้างไฟล์กำพน้าทุกชั่วโมง (เรียกจาก server) */
export function startUploadCleanup() {
  setInterval(() => {
    cleanupOrphanUploads().catch((error) => {
      console.error("[uploadCleanup] ล้างไฟล์กำพน้าไม่สำเร็จ:", error.message);
    });
  }, HOUR);

  console.log(`[uploadCleanup] ล้างไฟล์ที่ไม่ได้ใช้เกิน ${process.env.UPLOAD_TTL_HOURS ?? 24} ชั่วโมง`);
}