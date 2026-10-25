import express from "express";
import { uploadMedia, getMediaFeed, toggleMediaLike, getMediaComments, addMediaComment } from "../controllers/media.controllers";
import { upload } from "../middleware/multer.middleware";
import authCheck from "../middleware/error.middleware";

const mediaRoutes = express.Router();

// อัปโหลดวิดีโอ/รูปภาพ (ต้องล็อกอิน)
mediaRoutes.post("/upload", authCheck, upload.single("file"), uploadMedia);

// ดึงรายการวิดีโอทั้งหมด (สำหรับหน้า feed)
mediaRoutes.get("/feed", getMediaFeed);

mediaRoutes.post("/:id/like", authCheck, toggleMediaLike);
mediaRoutes.get("/:id/comments", getMediaComments);
mediaRoutes.post("/:id/comments", authCheck, addMediaComment);

// ดูวิดีโอเดี่ยว
mediaRoutes.get("/:id", getMediaFeed);

export default mediaRoutes;
