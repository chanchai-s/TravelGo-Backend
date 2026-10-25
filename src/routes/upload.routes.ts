import { Router } from "express";
import authCheck, { optionalAuth } from "../middleware/error.middleware";
import { rateLimitFor } from "../middleware/rateLimit.middleware";
import { uploadDoc, uploadFile, uploadImage } from "../controllers/upload.controllers";

const uploadRouter = Router();

// รูปที่พัก: เปิดให้คนที่ยังไม่ล็อกอินอัปโหลดได้ (ตามโมเดลกรอกก่อน login)
// เอกสารยืนยันตัวตน: ต้องล็อกอิน
uploadRouter.post("/image", optionalAuth, rateLimitFor("upload"), uploadImage, uploadFile);
uploadRouter.post("/doc", authCheck, rateLimitFor("upload"), uploadDoc, uploadFile);

export default uploadRouter;