import { Router } from "express";
import {
  deleteProperty,
  getProperty,
  patchProperty,
  saveProperty,
  applyAsHost,
  addVerificationDocument,
  getMyHostProfile,
  resubmitProperty,
  listMyStays,
  hostDashboard,
  setStopSell,
  listStopSell,
  savePayout,
  getPayout,
  acceptContract,
} from "../controllers/host.controllers";
import {
  listHostPayouts,
  getPayoutBalance,
  requestPayout,
  stripeOnboarding,
} from "../controllers/payout.controllers";
import authCheck, { optionalAuth } from "../middleware/error.middleware";
import { rateLimitFor } from "../middleware/rateLimit.middleware";

const hostRouter = Router();

// สมัครเป็นพันธมิตร (เจ้าของที่พัก) — ต้อง login
// *วางไว้ก่อน /:propertyId ไม่งั้น /me จะไปตรงกับรายการประกาศ*
hostRouter.post("/apply", authCheck, rateLimitFor("submit"), applyAsHost);
hostRouter.post("/documents", authCheck, rateLimitFor("submit"), addVerificationDocument);
hostRouter.get("/me", authCheck, getMyHostProfile);

// ประกาศของฉัน
hostRouter.get("/listings", authCheck, listMyStays);
hostRouter.get("/dashboard", authCheck, hostDashboard);

// ปิดขาย/เปิดขายรายวัน (เจ้าของเท่านั้น)
hostRouter.get("/:propertyId/stop-sell", authCheck, listStopSell);
hostRouter.post("/:propertyId/stop-sell", authCheck, rateLimitFor("submit"), setStopSell);

// บัญชีรับเงิน + สัญญา
hostRouter.post("/payout", authCheck, rateLimitFor("submit"), savePayout);
hostRouter.get("/payout", authCheck, getPayout);
hostRouter.post("/contract", authCheck, acceptContract);

// ระบบจ่ายเงินออก (Stripe)
hostRouter.get("/payouts", authCheck, listHostPayouts);
hostRouter.get("/payouts/balance", authCheck, getPayoutBalance);
hostRouter.post("/payouts/request", authCheck, rateLimitFor("submit"), requestPayout);
hostRouter.post("/payouts/stripe-onboarding", authCheck, stripeOnboarding);

// กรอกข้อมูล/บันทึกร่างได้โดยไม่ต้อง login (แบบ Agoda) — บังคับ login ตอนกดส่งตรวจสอบ (PENDING_REVIEW)
hostRouter.post(
  "/onboard/:propertyId",
  rateLimitFor("draft"),
  optionalAuth,
  saveProperty,
);
hostRouter.post("/:propertyId/resubmit", authCheck, rateLimitFor("submit"), resubmitProperty);
hostRouter.get("/:propertyId", optionalAuth, getProperty);
// แก้ไข: เจ้าของใช้ token / ร่างไร้เจ้าของใช้ draftKey
hostRouter.patch("/:propertyId", optionalAuth, patchProperty);
hostRouter.delete("/:propertyId", authCheck, deleteProperty);

export default hostRouter;