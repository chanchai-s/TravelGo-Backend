import { Request, Response } from "express";
import { saveStripeAccountService } from "../services/payout.services";

/** แอดมินผูกบัญชี Stripe Connect ให้เจ้าของ (acct_xxx) */
export async function saveStripeAccount(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const stripeAccountId = String(req.body?.stripeAccountId ?? "").trim();

  if (stripeAccountId !== "" && !stripeAccountId.startsWith("acct_")) {
    return res.status(400).json({
      success: false,
      message: "รหัสบัญชี Stripe ต้องขึ้นต้นด้วย acct_",
    });
  }

  try {
    const payout = await saveStripeAccountService(id, stripeAccountId);
    return res.status(200).json({ success: true, message: "บันทึกบัญชี Stripe แล้ว", data: payout });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}