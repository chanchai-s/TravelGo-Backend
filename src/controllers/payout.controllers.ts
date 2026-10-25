import { Request, Response } from "express";
import {
  connectOnboardingService,
  listAllPayoutsService,
  listHostPayoutsService,
  payoutBalanceService,
  rejectPayoutService,
  requestPayoutService,
  sendPayoutService,
} from "../services/payout.services";

// ---------- เจ้าของ ----------

export async function getPayoutBalance(req: Request, res: Response) {
  try {
    return res.status(200).json({ success: true, data: await payoutBalanceService(req.user?.id ?? "") });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function requestPayout(req: Request, res: Response) {
  try {
    const payout = await requestPayoutService(req.user?.id ?? "", req.body?.note);
    return res.status(200).json({ success: true, message: "ส่งคำขอจ่ายเงินแล้ว รอผู้ดูแลตรวจสอบ", data: payout });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function listHostPayouts(req: Request, res: Response) {
  try {
    return res.status(200).json({ success: true, data: await listHostPayoutsService(req.user?.id ?? "") });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function stripeOnboarding(req: Request, res: Response) {
  try {
    const url = await connectOnboardingService(req.user?.id ?? "");
    return res.status(200).json({ success: true, data: { url } });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

// ---------- แอดมิน ----------

export async function listPayouts(req: Request, res: Response) {
  try {
    const status = String(req.query.status ?? "PENDING");
    return res.status(200).json({ success: true, data: await listAllPayoutsService(status) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

export async function sendPayout(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const result = await sendPayoutService(id);
    return res.status(200).json({
      success: true,
      message: result.mock
        ? "จ่ายแบบจำลองสำเร็จ (ยังไม่ได้ตั้ง Stripe — ไม่มีเงินโอนจริง)"
        : "โอนเงินสำเร็จ",
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function rejectPayoutRequest(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? "").trim();
  if (reason === "") {
    return res.status(400).json({ success: false, message: "ต้องใส่เหตุผล" });
  }
  try {
    return res.status(200).json({ success: true, data: await rejectPayoutService(id, reason) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}