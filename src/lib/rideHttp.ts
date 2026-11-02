import type { Request, Response } from "express";

/** ตัวช่วยตอบ error/แบ่งหน้าให้ controller ของ ride ใช้ร่วมกัน */

const NOT_FOUND = /ไม่พบ/;
const FORBIDDEN = /ไม่มีสิทธิ์|ไม่ใช่/;
const UNAUTHORIZED = /ต้องเข้าสู่ระบบ/;

export function fail(res: Response, error: any, fallback = 400) {
  const message = String(error?.message ?? "เกิดข้อผิดพลาด");
  const code = NOT_FOUND.test(message)
    ? 404
    : FORBIDDEN.test(message)
      ? 403
      : UNAUTHORIZED.test(message)
        ? 401
        : fallback;
  return res.status(code).json({ success: false, message });
}

/** Express 5 ให้ params/query เป็น string | string[] — รวมให้เหลือ string เดียว */
export function paramOf(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : "";
}

export function queryText(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") {
    return undefined;
  }
  const result = first.trim();
  return result === "" ? undefined : result;
}

export function pageOf(req: Request): { page: number; size: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));
  return { page, size };
}

export function listOptions(req: Request) {
  const { page, size } = pageOf(req);
  const status = queryText(req.query.status);
  const serviceType = queryText(req.query.serviceType);
  const search = queryText(req.query.search);

  return {
    page,
    size,
    ...(status ? { status } : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(search ? { search } : {}),
  };
}
