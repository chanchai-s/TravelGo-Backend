import rateLimit from "express-rate-limit";

// กันยิงถล่มสร้างร่างจากคนเดียว (นับต่อ IP)
// โหมด dev = เก็บใน memory (ถ้าขึ้นหลายเครื่องจริงต้องย้ายไป Redis)
const isProd = process.env.NODE_ENV === "production";

export function rateLimitFor(kind: "draft" | "submit" | "upload") {
  const minutes = isProd ? 15 : 60;

  const max = kind === "draft" ? 60 : kind === "submit" ? 10 : 30;

  return rateLimit({
    windowMs: minutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
    },
  });
}