import fs from "node:fs";
import path from "node:path";

// เก็บไฟล์ไว้ใน back/uploads (dev) — ถ้าขึ้นโปรดูจริงค่อยเปลี่ยนเป็น S3/Cloudinary
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export function ensureUploadDir(): string {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  return UPLOAD_DIR;
}

// แปลงชื่อไฟล์ให้สุ่ม + เก็บนามสกุลเดิม (กันชื่อชนและ path traversal)
export function safeFileName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${stamp}${ext}`;
}

// ลบไฟล์ที่อยู่ใน uploads (ใช้ตอนลบร่างเก่า) — คืน true ถ้าลบสำเร็จ
export function removeUpload(fileUrl: string): boolean {
  if (!fileUrl.includes("/uploads/")) {
    return false;
  }
  const name = fileUrl.split("/uploads/")[1]?.split("?")[0] ?? "";
  if (name === "") {
    return false;
  }
  const full = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(full)) {
    return false;
  }
  fs.unlinkSync(full);
  return true;
}