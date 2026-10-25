import express from "express";
import authCheck from "../middleware/error.middleware";
import { adminListVouchers, adminCreateVoucher, adminDeleteVoucher, adminApproveVoucher, adminRejectVoucher, listMyVouchers, validateVoucher, claimVoucher, hostCreateVoucher, hostListVouchers } from "../controllers/vouchers.controllers";

const router = express.Router();

router.get("/vouchers/me", authCheck, listMyVouchers);
router.post("/vouchers/validate", validateVoucher);
router.post("/vouchers/claim", authCheck, claimVoucher);
router.post("/host/vouchers", authCheck, hostCreateVoucher);
router.get("/host/vouchers", authCheck, hostListVouchers);

router.get("/admin/vouchers", authCheck, adminListVouchers);
router.post("/admin/vouchers", authCheck, adminCreateVoucher);
router.delete("/admin/vouchers/:id", authCheck, adminDeleteVoucher);
router.post("/admin/vouchers/:id/approve", authCheck, adminApproveVoucher);
router.post("/admin/vouchers/:id/reject", authCheck, adminRejectVoucher);

export default router;
