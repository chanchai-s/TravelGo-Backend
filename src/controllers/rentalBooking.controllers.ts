import type { Request, Response } from "express";
import {
  approveRentalService,
  cancelRentalBookingService,
  completeRentalService,
  createRentalBookingService,
  getPartnerEarningsService,
  listPartnerRentalsService,
  listVehicleRentalsService,
  markNoShowService,
  payRentalAtBranchService,
  pickupRentalService,
  rejectRentalService,
  returnRentalService,
} from "../services/rentalBooking.services";

const NOT_FOUND = /ไม่พบ/;
const FORBIDDEN = /ไม่ใช่การจองของคุณ|ต้องเข้าสู่ระบบ/;

function fail(res: Response, error: any, fallback = 400) {
  const message = String(error?.message ?? "เกิดข้อผิดพลาด");
  const code = NOT_FOUND.test(message) ? 404 : FORBIDDEN.test(message) ? 403 : fallback;
  return res.status(code).json({ success: false, message });
}

function pageOf(req: Request): { page: number; size: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 20));
  return { page, size };
}

function partnerIdOf(req: Request): string {
  return req.vehiclePartner?.id ?? "";
}

// ---------- ลูกค้า ----------

export async function createRentalBooking(req: Request, res: Response) {
  try {
    const data = await createRentalBookingService(req.user?.id ?? "", req.body ?? {});
    return res.status(201).json({ success: true, message: "ส่งคำขอจองรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function cancelMyRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await cancelRentalBookingService(id, req.user?.id ?? "");
    return res.status(200).json({
      success: true,
      message: data.depositRefunded
        ? "ยกเลิกการจองแล้ว — คืนมัดจำที่สาขา (ไม่คืนค่าเช่า)"
        : "ยกเลิกการจองแล้ว",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- Partner ----------

export async function listPartnerRentals(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  const status = String(req.query.status ?? "ALL");
  try {
    const data = await listPartnerRentalsService(partnerIdOf(req), status, page, size);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function listVehicleRentals(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { page, size } = pageOf(req);
  const status = String(req.query.status ?? "ALL");
  try {
    const data = await listVehicleRentalsService(partnerIdOf(req), id, status, page, size);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function approveRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await approveRentalService(partnerIdOf(req), id, req.user?.id ?? "");
    return res.status(200).json({ success: true, message: "อนุมัติการจองแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rejectRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  try {
    const data = await rejectRentalService(partnerIdOf(req), id, reason);
    return res.status(200).json({ success: true, message: "ตีกลับการจองแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function payRentalAtBranch(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await payRentalAtBranchService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกการชำระเงินแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function pickupRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await pickupRentalService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกรับรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function returnRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await returnRentalService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกคืนรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function completeRental(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await completeRentalService(partnerIdOf(req), id);
    return res.status(200).json({ success: true, message: "ปิดงานการจองแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function markRentalNoShow(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await markNoShowService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกไม่มารับรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- Partner: รายได้ ----------

export async function getPartnerEarnings(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  try {
    const data = await getPartnerEarningsService(partnerIdOf(req), page, size);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}
