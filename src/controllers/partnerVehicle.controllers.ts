import type { Request, Response } from "express";
import {
  approveVehicleService,
  createBranchService,
  createPartnerVehicleService,
  createVehicleBlockService,
  deactivateBranchService,
  deletePartnerVehicleService,
  deleteVehicleBlockService,
  getPartnerVehicleService,
  listBranchesService,
  listPartnerVehiclesService,
  listVehiclesForReviewService,
  rejectVehicleService,
  submitPartnerVehicleService,
  updateBranchService,
  updatePartnerVehicleService,
  vehicleCalendarService,
} from "../services/partnerVehicle.services";

const FORBIDDEN = /ยังไม่ได้สมัคร|ยังไม่ผ่านการยืนยัน|ไม่มีสิทธิ์/;
const NOT_FOUND = /ไม่พบ/;

function fail(res: Response, error: any, fallback = 400) {
  const message = String(error?.message ?? "เกิดข้อผิดพลาด");
  const code = NOT_FOUND.test(message) ? 404 : FORBIDDEN.test(message) ? 403 : fallback;
  return res.status(code).json({ success: false, message });
}

function partnerIdOf(req: Request): string {
  return req.vehiclePartner?.id ?? "";
}

// ---------- สาขา ----------

export async function listPartnerBranches(req: Request, res: Response) {
  try {
    const includeInactive = String(req.query.includeInactive ?? "") === "true";
    const data = await listBranchesService(partnerIdOf(req), includeInactive);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function createPartnerBranch(req: Request, res: Response) {
  try {
    const data = await createBranchService(partnerIdOf(req), req.body ?? {});
    return res.status(201).json({ success: true, message: "เพิ่มสาขาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updatePartnerBranch(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await updateBranchService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกสาขาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function deactivatePartnerBranch(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await deactivateBranchService(partnerIdOf(req), id);
    return res.status(200).json({ success: true, message: "ปิดใช้งานสาขาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- รถ ----------

export async function listPartnerVehicles(req: Request, res: Response) {
  try {
    const status = String(req.query.status ?? "ALL");
    const data = await listPartnerVehiclesService(partnerIdOf(req), status);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function getPartnerVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await getPartnerVehicleService(partnerIdOf(req), id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function createPartnerVehicle(req: Request, res: Response) {
  try {
    const data = await createPartnerVehicleService(
      partnerIdOf(req),
      req.vehiclePartner?.companyName ?? "",
      req.body ?? {},
    );
    return res.status(201).json({ success: true, message: "เพิ่มรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updatePartnerVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await updatePartnerVehicleService(partnerIdOf(req), id, req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function submitPartnerVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await submitPartnerVehicleService(partnerIdOf(req), id);
    return res.status(200).json({ success: true, message: "ส่งรถเข้าคิวตรวจแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function deletePartnerVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await deletePartnerVehicleService(partnerIdOf(req), id);
    return res.status(200).json({ success: true, message: "ลบรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- ปฏิทิน / ปิดช่วงเวลา ----------

export async function partnerVehicleCalendar(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await vehicleCalendarService(
      partnerIdOf(req),
      id,
      req.query.from,
      req.query.to,
    );
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function createPartnerVehicleBlock(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await createVehicleBlockService(partnerIdOf(req), id, req.body ?? {});
    return res.status(201).json({ success: true, message: "ปิดช่วงเวลาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function deletePartnerVehicleBlock(req: Request, res: Response) {
  const { blockId } = req.params as { blockId: string };
  try {
    const data = await deleteVehicleBlockService(partnerIdOf(req), blockId);
    return res.status(200).json({ success: true, message: "เปิดช่วงเวลาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- แอดมินตรวจรถ ----------

export async function listVehiclesForReview(req: Request, res: Response) {
  const status = String(req.query.status ?? "PENDING");
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 20));
  try {
    const data = await listVehiclesForReviewService(status, page, size);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function approveVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await approveVehicleService(id, req.user?.id ?? "");
    return res.status(200).json({ success: true, message: "อนุมัติรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function rejectVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผลที่ตีกลับ" });
  }
  try {
    const data = await rejectVehicleService(id, req.user?.id ?? "", reason);
    return res.status(200).json({ success: true, message: "ตีกลับรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}
