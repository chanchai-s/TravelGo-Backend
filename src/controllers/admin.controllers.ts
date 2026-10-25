import { Request, Response } from "express";
import {
  approveAllService,
  approveStayService,
  getHostDocuments,
  getStayForReview,
  listHostsForReview,
  listModerationLogs,
  listStaysForReview,
  rejectHostService,
  rejectStayService,
  verifyHostService,
} from "../services/admin.services";
import { verifyPayoutService } from "../services/payout.services";

function pageOf(req: Request): { page: number; size: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 20));
  return { page, size };
}

function fail(res: Response, error: any) {
  const code =
    error.message === "Property not found"
      ? 404
      : error.message === "Not your property"
        ? 403
        : 500;
  return res.status(code).json({ success: false, message: error.message });
}

// ---------- คิวประกาศ ----------

export async function listStays(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  const status = String(req.query.status ?? "PENDING_REVIEW");
  try {
    return res.status(200).json({ success: true, data: await listStaysForReview(status, page, size) });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function getStay(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const stay = await getStayForReview(id);
    if (!stay) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }
    return res.status(200).json({ success: true, data: { ...stay, documents: await getHostDocuments(stay.host?.userId ?? "") } });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function approveStay(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    return res.status(200).json({ success: true, data: await approveStayService(id, req.user?.id ?? "") });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rejectStay(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผลที่ตีกลับ" });
  }
  try {
    return res.status(200).json({ success: true, data: await rejectStayService(id, req.user?.id ?? "", reason) });
  } catch (error: any) {
    return fail(res, error);
  }
}

// อนุมัติทั้งหมดในคิว (ข้ามรายการที่ยังไม่ผ่าน)
export async function approveAll(req: Request, res: Response) {
  try {
    const data = await approveAllService(req.user?.id ?? "");
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ตรวจบัญชีรับเงินของเจ้าของ
export async function verifyPayout(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  try {
    const data = await verifyPayoutService(id, req.user?.id ?? "", true, reason);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rejectPayout(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผลที่ตีกลับบัญชีรับเงิน" });
  }
  try {
    const data = await verifyPayoutService(id, req.user?.id ?? "", false, reason);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- คิวเจ้าของ ----------

export async function listHosts(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  const status = String(req.query.status ?? "PENDING");
  try {
    return res.status(200).json({ success: true, data: await listHostsForReview(status, page, size) });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function verifyHost(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    return res.status(200).json({ success: true, data: await verifyHostService(id, req.user?.id ?? "") });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rejectHost(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผลที่ตีกลับ" });
  }
  try {
    return res.status(200).json({ success: true, data: await rejectHostService(id, req.user?.id ?? "", reason) });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function logs(req: Request, res: Response) {
  const { page, size } = pageOf(req);
  try {
    return res.status(200).json({ success: true, data: await listModerationLogs(page, size) });
  } catch (error: any) {
    return fail(res, error);
  }
}