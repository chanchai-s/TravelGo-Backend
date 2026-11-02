import type { Request, Response } from "express";
import {
  listDriversService,
  listRideTiersForAdminService,
  rejectDriverService,
  setDriverCommissionService,
  setDriverDocumentStatusService,
  updateRideTierService,
  verifyDriverService,
} from "../services/rideDriver.services";
import { cancelRideJobService, listAdminJobsService } from "../services/rideJob.services";
import { ackSosService, closeSosService, listSosService } from "../services/rideSos.services";
import { fail, listOptions, pageOf, paramOf, queryText } from "../lib/rideHttp";

// ---------- คนขับ ----------

export async function listDrivers(req: Request, res: Response) {
  try {
    const { page, size } = pageOf(req);
    const data = await listDriversService({
      page,
      size,
      status: req.query.status,
      search: req.query.search,
    });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function verifyDriver(req: Request, res: Response) {
  try {
    const data = await verifyDriverService(
      paramOf(req.params.id),
      req.user?.id ?? "",
      req.body ?? {},
    );
    return res.status(200).json({ success: true, message: "อนุมัติคนขับแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rejectDriver(req: Request, res: Response) {
  try {
    const data = await rejectDriverService(
      paramOf(req.params.id),
      req.user?.id ?? "",
      req.body ?? {},
    );
    return res.status(200).json({ success: true, message: "ไม่อนุมัติคนขับแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function setDriverCommission(req: Request, res: Response) {
  try {
    const data = await setDriverCommissionService(paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "ตั้งค่าคอมมิชชันแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function reviewDriverDocument(req: Request, res: Response) {
  try {
    const data = await setDriverDocumentStatusService(paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "อัปเดตสถานะเอกสารแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- งาน ----------

export async function listRides(req: Request, res: Response) {
  try {
    const data = await listAdminJobsService(listOptions(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function adminCancelRide(req: Request, res: Response) {
  try {
    const data = await cancelRideJobService(
      paramOf(req.params.id),
      { userId: req.user?.id ?? "", role: "ADMIN" },
      req.body?.reason,
    );
    return res.status(200).json({ success: true, message: "ยกเลิกงานแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- SOS ----------

export async function listSosEvents(req: Request, res: Response) {
  try {
    const data = await listSosService({ status: queryText(req.query.status) });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function ackSosEvent(req: Request, res: Response) {
  try {
    const data = await ackSosService(paramOf(req.params.id), req.user?.id ?? "");
    return res.status(200).json({ success: true, message: "รับเรื่องแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function closeSosEvent(req: Request, res: Response) {
  try {
    const data = await closeSosService(paramOf(req.params.id), req.user?.id ?? "");
    return res.status(200).json({ success: true, message: "ปิดเหตุแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- ชั้นราคา ----------

export async function listRideTiers(req: Request, res: Response) {
  try {
    const data = await listRideTiersForAdminService(queryText(req.query.serviceType));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updateRideTier(req: Request, res: Response) {
  try {
    const data = await updateRideTierService(paramOf(req.params.code), req.body ?? {});
    return res.status(200).json({ success: true, message: "อัปเดตชั้นราคาแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}
