import { Request, Response } from "express";
import {
  cancelBookingService,
  changeBookingDatesService,
  createPackageBookingService,
  createReviewService,
  createStayBookingService,
  listMyBookingsService,
  listStayReviewsService,
} from "../services/booking.services";
import { availabilityForStay, availabilityCalendar } from "../lib/availability";

// ---------- การจอง ----------

export async function createBooking(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const booking = await createStayBookingService(userId, req.body ?? {});
    return res.status(200).json({ success: true, message: "จองสำเร็จ", data: booking });
  } catch (error: any) {
    const code = /ไม่พบประเภทห้อง|ที่พักไม่พร้อมให้จอง/.test(error.message)
      ? 404
      : /ห้องเต็ม|เหลือแค่/.test(error.message)
        ? 409
        : 400;
    return res.status(code).json({ success: false, message: error.message });
  }
}

export async function createPackageBooking(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const booking = await createPackageBookingService(userId, req.body ?? {});
    return res.status(200).json({ success: true, message: "จองพร้อมกันสำเร็จ", data: booking });
  } catch (error: any) {
    const code = /ไม่พบประเภทห้อง|ที่พักไม่พร้อมให้จอง|เที่ยวบินไม่พร้อม/.test(error.message)
      ? 404
      : /ห้องเต็ม|เหลือแค่|ที่นั่งเหลือไม่พอ/.test(error.message)
        ? 409
        : 400;
    return res.status(code).json({ success: false, message: error.message });
  }
}

export async function listMyBookings(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    return res.status(200).json({ success: true, data: await listMyBookingsService(userId) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ยกเลิกการจอง (ยังไม่มีระบบคืนเงิน — บอกผู้ใช้ให้ทราบตรงๆ)
export async function cancelBooking(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const booking = await cancelBookingService(id, req.user?.id ?? "");
    return res.status(200).json({
      success: true,
      message: "ยกเลิกการจองแล้ว (ระบบคืนเงินยังไม่ได้เชื่อมต่อ — กรุณาติดต่อเจ้าของที่พัก)",
      data: booking,
      refundAvailable: false,
    });
  } catch (error: any) {
    const code =
      error.message === "Booking not found"
        ? 404
        : error.message === "Not your booking"
          ? 403
          : 400;
    return res.status(code).json({ success: false, message: error.message });
  }
}

// เปลี่ยนวันเข้าออก (เช็คห้องว่างของช่วงใหม่ก่อน)
export async function changeBookingDates(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { checkIn, checkOut } = req.body ?? {};
  try {
    const booking = await changeBookingDatesService(
      id,
      req.user?.id ?? "",
      String(checkIn ?? ""),
      String(checkOut ?? ""),
    );
    return res.status(200).json({ success: true, message: "เปลี่ยนวันที่แล้ว", data: booking });
  } catch (error: any) {
    const code =
      error.message === "Booking not found"
        ? 404
        : error.message === "Not your booking"
          ? 403
          : 400;
    return res.status(code).json({ success: false, message: error.message });
  }
}

// ---------- ห้องว่าง ----------

export async function stayAvailability(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { checkIn, checkOut } = req.query;

  // ไม่ส่งวันที่ = ดูจำนวนห้องทั้งหมดของแต่ละประเภท
  const from = typeof checkIn === "string" && checkIn !== "" ? new Date(checkIn) : new Date();
  const to =
    typeof checkOut === "string" && checkOut !== ""
      ? new Date(checkOut)
      : new Date(from.getTime() + 24 * 60 * 60 * 1000);

  try {
    const rooms = await availabilityForStay(id, from, to);
    return res.status(200).json({ success: true, data: { checkIn: from, checkOut: to, rooms } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ปฏิทินห้องว่างล่วงหน้า (ใช้แสดงแถบ 14 วัน)
export async function stayCalendar(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 14));
  const roomTypeId = typeof req.query.roomTypeId === "string" ? req.query.roomTypeId : undefined;

  try {
    return res
      .status(200)
      .json({ success: true, data: await availabilityCalendar(id, days, roomTypeId) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ---------- รีวิว ----------

export async function listReviews(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    return res.status(200).json({ success: true, data: await listStayReviewsService(id) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function createReview(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const userId = req.user?.id ?? "";
  const { rating, text } = req.body ?? {};
  try {
    const review = await createReviewService(userId, id, Number(rating), String(text ?? ""));
    return res.status(200).json({ success: true, message: "ขอบคุณสำหรับรีวิว", data: review });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}