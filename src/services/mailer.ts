import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

// ตั้งค่า SMTP ใน .env เพื่อส่งจริง ถ้ายังไม่ตั้งจะพิมพ์ลง console แทน
function getTransporter(): Transporter | null {
  if (transporter) {
    return transporter;
  }
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * ส่งอีเมลแจ้งเจ้าของ
 * - มี SMTP config → ส่งจริง
 * - ไม่มี → พิมพ์ลง console (dev) ไม่ทำให้ flow พัง
 */
export async function notifyHost(email: string, subject: string, text: string) {
  if (!email) {
    return;
  }
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[email→${email}] ${subject}\n  ${text}`);
    return;
  }
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? "WanderGo <no-reply@wandergo.example>",
      to: email,
      subject,
      text,
    });
  } catch (error: any) {
    // ส่งไม่สำเร็จไม่ควรทำให้การอนุมัติล้ม
    console.error("[mailer] ส่งไม่สำเร็จ:", error.message);
  }
}