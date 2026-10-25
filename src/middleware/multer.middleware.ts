import multer from "multer";

/**
 * ตั้งค่า multer สำหรับอัปโหลดไฟล์วิดีโอ/รูปภาพ
 * เก็บไฟล์ชั่วคราวในโฟลเดอร์ uploads/ ก่อนส่งไป cloudinary
 * ขนาดไฟล์สูงสุด 100 MB
 * รับเฉพาะไฟล์วิดีโอและรูปภาพ
 */
export const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    // รับเฉพาะไฟล์วิดีโอและรูปภาพ
    if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("รองรับเฉพาะไฟล์วิดีโอและรูปภาพเท่านั้น"));
    }
  },
});