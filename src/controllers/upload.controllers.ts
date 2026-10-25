import { Request, Response } from "express";
import multer from "multer";
import { UPLOAD_DIR, ensureUploadDir, safeFileName } from "../lib/upload";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// kind = image (รูปที่พัก) | doc (เอกสารยืนยันตัวตน)
const uploadOf = (kind: "image" | "doc") =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
      filename: (_req, file, cb) => cb(null, safeFileName(file.originalname)),
    }),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
      const ok = (kind === "image" ? IMAGE_TYPES : DOC_TYPES).includes(file.mimetype);
      cb(null, ok);
    },
  });

export const uploadImage = uploadOf("image").single("file");
export const uploadDoc = uploadOf("doc").single("file");

// อัปโหลด 1 ไฟล์ → คืน fileUrl
export function uploadFile(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, message: "ไม่พบไฟล์ที่อัปโหลด" });
  }
  return res.status(200).json({
    success: true,
    data: { fileUrl: `/uploads/${file.filename}`, fileName: file.originalname },
  });
}