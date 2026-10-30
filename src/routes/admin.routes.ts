import { Router } from "express";
import authCheck, { requireAdmin } from "../middleware/error.middleware";
import {
  approveAll,
  approveStay,
  getStay,
  listHosts,
  listStays,
  logs,
  rejectHost,
  rejectPayout,
  rejectStay,
  verifyHost,
  verifyPayout,
} from "../controllers/admin.controllers";
import {
  listPayouts,
  sendPayout,
  rejectPayoutRequest,
} from "../controllers/payout.controllers";
import { saveStripeAccount } from "../controllers/stripeAccount.controllers";
import {
  listVehiclePartners,
  rejectVehiclePartner,
  updateVehiclePartnerCommission,
  verifyVehiclePartner,
} from "../controllers/partner.controllers";

const adminRouter = Router();

// ทุกเส้นทางใต้ /admin ต้องเป็นแอดมิน
adminRouter.use(authCheck, requireAdmin);

adminRouter.get("/stays", listStays);
adminRouter.get("/stays/:id", getStay);
adminRouter.post("/stays/:id/approve", approveStay);
adminRouter.post("/stays/:id/reject", rejectStay);
adminRouter.post("/stays/approve-all", approveAll);

adminRouter.get("/hosts", listHosts);
adminRouter.post("/hosts/:id/verify", verifyHost);
adminRouter.post("/hosts/:id/reject", rejectHost);
adminRouter.post("/hosts/:id/payout/verify", verifyPayout);
adminRouter.post("/hosts/:id/payout/reject", rejectPayout);

adminRouter.get("/logs", logs);

// พาร์ทเนอร์รถเช่า (บริษัท)
adminRouter.get("/partners", listVehiclePartners);
adminRouter.post("/partners/:id/verify", verifyVehiclePartner);
adminRouter.post("/partners/:id/reject", rejectVehiclePartner);
adminRouter.post("/partners/:id/commission", updateVehiclePartnerCommission);

// คิวจ่ายเงินให้เจ้าของ (Stripe)
adminRouter.get("/payouts", listPayouts);
adminRouter.post("/payouts/:id/send", sendPayout);
adminRouter.post("/payouts/:id/reject", rejectPayoutRequest);
adminRouter.post("/hosts/:id/stripe-account", saveStripeAccount);

export default adminRouter;