import prisma from "../lib/prismaClient";
import { removeUpload } from "../lib/upload";

const HOUR = 60 * 60 * 1000;
const CHECK_EVERY_HOUR = 60 * 60 * 1000;

// ร่างที่ไม่แตะเกิน TTL ชั่วโมง = คนกรอกทิ้งไว้ ให้ลบทิ้งกัน DB/ดิสก์บวม
// ตั้งค่าได้ใน .env: DRAFT_TTL_HOURS=24
function ttlHours(): number {
  const value = Number(process.env.DRAFT_TTL_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

async function cleanupExpiredDrafts() {
  const deadline = new Date(Date.now() - ttlHours() * HOUR);

  // เฉพาะร่างที่ยังไม่มีเจ้าของ (คนไม่ได้ล็อกอินกรอก) — ปลอดภัย ไม่ไปตัดคนที่ล็อกอินค้างไว้
  const stale = await prisma.stay.findMany({
    where: { status: "DRAFT", hostId: null, updatedAt: { lt: deadline } },
    select: { id: true, photos: { select: { url: true } } },
  });

  for (const stay of stale) {
    for (const photo of stay.photos) {
      removeUpload(photo.url);
    }
    await prisma.stay.delete({ where: { id: stay.id } });
  }

  if (stale.length > 0) {
    console.log(`[draftCleanup] ลบร่างที่ไม่มีเจ้าของ ${stale.length} รายการ`);
  }
}

// เริ่มวนล้างร่างทุกชั่วโมง
export function startDraftCleanup() {
  setInterval(() => {
    cleanupExpiredDrafts().catch((error) => {
      console.error("[draftCleanup] ล้างร่างไม่สำเร็จ:", error.message);
    });
  }, CHECK_EVERY_HOUR);

  console.log(`[draftCleanup] ลบร่างไร้เจ้าของที่ค้างเกิน ${ttlHours()} ชั่วโมง`);
}

// ใช้ตอนเทสเรียกตรง ๆ
export { cleanupExpiredDrafts };