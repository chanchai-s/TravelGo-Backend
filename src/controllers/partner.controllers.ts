import type { Request, Response } from "express";
import {
  acceptVehiclePartnerContractService,
  addVehiclePartnerDocumentService,
  applyAsVehiclePartnerService,
  getMyVehiclePartnerService,
  listVehiclePartnersForReview,
  rejectVehiclePartnerService,
  updateVehiclePartnerCommissionService,
  updateVehiclePartnerSettingsService,
  verifyVehiclePartnerService,
} from "../services/partner.services";

// ข้อความที่แปลว่า "ยังไม่มีสิทธิ์/ยังไม่สมัคร" → 403
const FORBIDDEN = /ยังไม่ได้สมัคร|ยังไม่ผ่านการยืนยัน|ไม่มีสิทธิ์/;
// ข้อความที่แปลว่า "หาไม่เจอ" → 404
const NOT_FOUND = /ไม่พบ/;

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

// ---------- ฝั่งพาร์ทเนอร์ (บริษัทรถเช่า) ----------

export async function applyAsVehiclePartner(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const partner = await applyAsVehiclePartnerService(userId, req.body ?? {});
    return res.status(200).json({
      success: true,
      message: "ส่งคำขอเป็นพาร์ทเนอร์รถเช่าแล้ว รอตรวจสอบ",
      data: partner,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function getMyVehiclePartner(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const partner = await getMyVehiclePartnerService(userId);
    return res.status(200).json({ success: true, data: partner });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function addVehiclePartnerDocument(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  const { type, url } = req.body ?? {};
  try {
    const document = await addVehiclePartnerDocumentService(userId, String(type ?? ""), String(url ?? ""));
    return res.status(200).json({ success: true, message: "เพิ่มเอกสารแล้ว", data: document });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function acceptVehiclePartnerContract(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const partner = await acceptVehiclePartnerContractService(userId);
    return res.status(200).json({ success: true, message: "ยอมรับข้อตกลงแล้ว", data: partner });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updateVehiclePartnerSettings(req: Request, res: Response) {
  const userId = req.user?.id ?? "";
  try {
    const partner = await updateVehiclePartnerSettingsService(userId, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกการตั้งค่าแล้ว", data: partner });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- ฝั่งแอดมิน ----------

export async function listVehiclePartners(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  const status = String(req.query.status ?? "PENDING");
  try {
    const data = await listVehiclePartnersForReview(status, page, size);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function verifyVehiclePartner(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const partner = await verifyVehiclePartnerService(id, req.user?.id ?? "");
    return res.status(200).json({ success: true, message: "อนุมัติพาร์ทเนอร์แล้ว", data: partner });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function rejectVehiclePartner(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผลที่ตีกลับ" });
  }
  try {
    const partner = await rejectVehiclePartnerService(id, req.user?.id ?? "", reason);
    return res.status(200).json({ success: true, message: "ตีกลับคำขอแล้ว", data: partner });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function updateVehiclePartnerCommission(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const rate = Number(req.body?.rate);
  const reason = String(req.body?.reason ?? "").trim();
  try {
    const partner = await updateVehiclePartnerCommissionService(id, req.user?.id ?? "", rate, reason);
    return res.status(200).json({ success: true, message: "ปรับค่าคอมแล้ว", data: partner });
  } catch (error: any) {
    return fail(res, error);
  }
}
