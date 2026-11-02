import type { Request, Response } from "express";
import {
  addDriverDocumentService,
  addDriverVehicleService,
  applyDriverService,
  deleteDriverVehicleService,
  getDriverMeService,
  listDriverDocumentsService,
  listDriverEarningsService,
  listDriverVehiclesService,
  setDriverOnlineService,
  updateDriverLocationService,
  updateDriverVehicleService,
} from "../services/rideDriver.services";
import {
  acceptRideJobService,
  arriveRideJobService,
  collectPaymentService,
  completeRideJobService,
  confirmDeliveryService,
  listAvailableJobsService,
  startRideJobService,
} from "../services/rideJob.services";
import { fail, listOptions, paramOf, queryText } from "../lib/rideHttp";

function driverIdOf(req: Request): string {
  return req.user?.id ?? "";
}

// ---------- สมัคร / โปรไฟล์ ----------

export async function applyDriver(req: Request, res: Response) {
  try {
    const data = await applyDriverService(driverIdOf(req), req.body ?? {});
    return res.status(201).json({
      success: true,
      message: "ส่งใบสมัครแล้ว รอแอดมินตรวจสอบ",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function getDriverMe(req: Request, res: Response) {
  try {
    const data = await getDriverMeService(driverIdOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- เอกสาร ----------

export async function addDriverDocument(req: Request, res: Response) {
  try {
    const data = await addDriverDocumentService(driverIdOf(req), req.body ?? {});
    return res.status(201).json({ success: true, message: "อัปโหลดเอกสารแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function listDriverDocuments(req: Request, res: Response) {
  try {
    const data = await listDriverDocumentsService(driverIdOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- รถ ----------

export async function listDriverVehicles(req: Request, res: Response) {
  try {
    const data = await listDriverVehiclesService(driverIdOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function addDriverVehicle(req: Request, res: Response) {
  try {
    const data = await addDriverVehicleService(driverIdOf(req), req.body ?? {});
    return res.status(201).json({ success: true, message: "เพิ่มรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updateDriverVehicle(req: Request, res: Response) {
  try {
    const data = await updateDriverVehicleService(driverIdOf(req), paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "อัปเดตรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function deleteDriverVehicle(req: Request, res: Response) {
  try {
    const data = await deleteDriverVehicleService(driverIdOf(req), paramOf(req.params.id));
    return res.status(200).json({ success: true, message: "ปิดใช้งานรถแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- เปิดรับงาน / พิกัด ----------

export async function setDriverStatus(req: Request, res: Response) {
  try {
    const data = await setDriverOnlineService(driverIdOf(req), req.body ?? {});
    return res.status(200).json({
      success: true,
      message: data.isOnline ? "เปิดรับงานแล้ว" : "ปิดรับงานแล้ว",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updateDriverLocation(req: Request, res: Response) {
  try {
    const data = await updateDriverLocationService(driverIdOf(req), req.body ?? {});
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- งาน ----------

export async function listAvailableJobs(req: Request, res: Response) {
  try {
    const data = await listAvailableJobsService(driverIdOf(req), queryText(req.query.serviceType));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function acceptRideJob(req: Request, res: Response) {
  try {
    const data = await acceptRideJobService(driverIdOf(req), paramOf(req.params.id));
    return res.status(200).json({ success: true, message: "รับงานแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function arriveRideJob(req: Request, res: Response) {
  try {
    const data = await arriveRideJobService(driverIdOf(req), paramOf(req.params.id));
    return res.status(200).json({ success: true, message: "ถึงจุดรับแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function startRideJob(req: Request, res: Response) {
  try {
    const data = await startRideJobService(driverIdOf(req), paramOf(req.params.id));
    return res.status(200).json({ success: true, message: "เริ่มเดินทางแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function completeRideJob(req: Request, res: Response) {
  try {
    const data = await completeRideJobService(driverIdOf(req), paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "จบงานแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function confirmDelivery(req: Request, res: Response) {
  try {
    const data = await confirmDeliveryService(driverIdOf(req), paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "ยืนยันการส่งสำเร็จ", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function collectPayment(req: Request, res: Response) {
  try {
    const data = await collectPaymentService(driverIdOf(req), paramOf(req.params.id), req.body ?? {});
    return res.status(200).json({ success: true, message: "บันทึกการรับเงินแล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function listMyEarnings(req: Request, res: Response) {
  try {
    const data = await listDriverEarningsService(driverIdOf(req), {
      ...listOptions(req),
      ...(req.query.status ? { status: queryText(req.query.status) } : {}),
    });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}
