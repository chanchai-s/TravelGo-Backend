import type { Request, Response } from "express";
import {
  listRideAddonsService,
  listRideTiersService,
  parseServiceType,
  quoteRideService,
} from "../services/rideFare.services";
import {
  cancelRideJobService,
  createRideJobService,
  getRideJobService,
  listRiderJobsService,
  payRideJobService,
  rateRideJobService,
} from "../services/rideJob.services";
import { listJobMessagesService, sendJobMessageService } from "../services/rideChat.services";
import { createSosService, listJobSosService } from "../services/rideSos.services";
import { fail, listOptions, paramOf } from "../lib/rideHttp";

function viewerOf(req: Request) {
  return { userId: req.user?.id ?? "", role: req.user?.role ?? null };
}

// ---------- แคตตาล็อก / ราคา ----------

export async function listRideTiers(req: Request, res: Response) {
  try {
    const serviceType = req.query.serviceType
      ? parseServiceType(req.query.serviceType)
      : undefined;
    const tiers = await listRideTiersService(serviceType);
    return res.status(200).json({ success: true, data: tiers });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function listRideAddons(req: Request, res: Response) {
  try {
    const serviceType = req.query.serviceType
      ? parseServiceType(req.query.serviceType)
      : undefined;
    return res.status(200).json({ success: true, data: listRideAddonsService(serviceType) });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function quoteRide(req: Request, res: Response) {
  try {
    const data = await quoteRideService(req.body ?? {});
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- งานของผู้โดยสาร ----------

export async function createRideJob(req: Request, res: Response) {
  try {
    const data = await createRideJobService(req.user?.id ?? "", req.body ?? {});
    return res.status(201).json({
      success: true,
      message: "ส่งคำขอแล้ว กำลังหาคนขับให้",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function listMyRideJobs(req: Request, res: Response) {
  try {
    const data = await listRiderJobsService(req.user?.id ?? "", listOptions(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function getRideJob(req: Request, res: Response) {
  try {
    const data = await getRideJobService(paramOf(req.params.id), viewerOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function cancelRideJob(req: Request, res: Response) {
  try {
    const data = await cancelRideJobService(
      paramOf(req.params.id),
      viewerOf(req),
      req.body?.reason,
    );
    return res.status(200).json({
      success: true,
      message: data?.paymentStatus === "REFUNDED" ? "ยกเลิกงานแล้ว — คืนเงินล่วงหน้าให้แล้ว" : "ยกเลิกงานแล้ว",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function payRideJob(req: Request, res: Response) {
  try {
    const data = await payRideJobService(paramOf(req.params.id), req.user?.id ?? "", req.body ?? {});
    return res.status(200).json({ success: true, message: "ชำระเงินสำเร็จ", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function rateRideJob(req: Request, res: Response) {
  try {
    const data = await rateRideJobService(paramOf(req.params.id), req.user?.id ?? "", req.body ?? {});
    return res.status(201).json({ success: true, message: "ขอบคุณสำหรับคะแนน", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- แชท ----------

export async function listRideMessages(req: Request, res: Response) {
  try {
    const data = await listJobMessagesService(paramOf(req.params.id), viewerOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function sendRideMessage(req: Request, res: Response) {
  try {
    const { message, receiverId } = await sendJobMessageService(
      paramOf(req.params.id),
      req.user?.id ?? "",
      req.body ?? {},
    );
    return res.status(201).json({ success: true, message: "ส่งข้อความแล้ว", data: message, receiverId });
  } catch (error: any) {
    return fail(res, error);
  }
}

// ---------- SOS ----------

export async function createRideSos(req: Request, res: Response) {
  try {
    const data = await createSosService(paramOf(req.params.id), viewerOf(req), req.body ?? {});
    return res.status(201).json({
      success: true,
      message: "แจ้งเหตุแล้ว ทีมงานกำลังติดต่อกลับ",
      data,
    });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function listRideSos(req: Request, res: Response) {
  try {
    const data = await listJobSosService(paramOf(req.params.id), viewerOf(req));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}
