import Stripe from "stripe";

let stripe: Stripe | null = null;

// ยังไม่ตั้ง STRIPE_SECRET_KEY = ใช้โหมดจำลอง (ไม่ยิงเงินจริง)
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (!stripeEnabled()) {
    return null;
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return stripe;
}

export type TransferResult = {
  ok: boolean;
  ref?: string;
  mock: boolean;
  message?: string;
};

/**
 * โอนเงินให้เจ้าของผ่าน Stripe Transfer (เงินจากแพลตฟอร์ม → บัญชี Connect ของเจ้าของ)
 * ถ้ายังไม่มี key หรือยังไม่ได้ผูกบัญชี Connect จะคืน ok=false พร้อมเหตุผลที่อ่านได้
 */
export async function transferToHost(
  amount: number,
  stripeAccountId: string | null | undefined,
  description: string,
): Promise<TransferResult> {
  const client = getStripe();

  // โหมดจำลอง — ใช้ตอนยังไม่ได้ตั้งค่า Stripe
  if (!client) {
    return {
      ok: true,
      mock: true,
      ref: `MOCK-${Date.now().toString(36).toUpperCase()}`,
      message: "จำลองการโอน (ยังไม่ได้ตั้ง STRIPE_SECRET_KEY)",
    };
  }

  if (!stripeAccountId) {
    return {
      ok: false,
      mock: false,
      message: "เจ้าของยังไม่ได้เชื่อมบัญชี Stripe Connect",
    };
  }

  try {
    const transfer = await client.transfers.create({
      amount: Math.round(amount * 100), // Stripe ใช้หน่วยเล็ก (satang)
      currency: "thb",
      destination: stripeAccountId,
      description,
    });

    return { ok: true, mock: false, ref: transfer.id };
  } catch (error: any) {
    return { ok: false, mock: false, message: error.message };
  }
}

/**
 * สร้างลิงก์ให้เจ้าของไปสมัคร/เชื่อมบัญชี Stripe Connect
 * คืน null ถ้ายังไม่ตั้ง key
 */
export async function createConnectOnboardingLink(userId: string): Promise<string | null> {
  const client = getStripe();
  if (!client) {
    return null;
  }

  const account = await client.accounts.create({
    type: "express",
    capabilities: { transfers: { requested: true } },
    metadata: { userId },
  });

  const link = await client.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.FRONT_URL ?? "http://localhost:3000"}/host/payouts`,
    return_url: `${process.env.FRONT_URL ?? "http://localhost:3000"}/host/payouts?connected=1`,
    type: "account_onboarding",
  });

  return link.url;
}