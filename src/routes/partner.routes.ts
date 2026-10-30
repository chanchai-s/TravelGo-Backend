import { Router } from "express";
import authCheck from "../middleware/error.middleware";
import { requireVehiclePartner } from "../middleware/vehiclePartner.middleware";
import { rateLimitFor } from "../middleware/rateLimit.middleware";
import {
  acceptVehiclePartnerContract,
  addVehiclePartnerDocument,
  applyAsVehiclePartner,
  getMyVehiclePartner,
  updateVehiclePartnerSettings,
} from "../controllers/partner.controllers";

const partnerRouter = Router();

// สมัคร/แก้ไขข้อมูลบริษัทรถเช่า — ต้อง login
partnerRouter.post("/apply", authCheck, rateLimitFor("submit"), applyAsVehiclePartner);
partnerRouter.get("/me", authCheck, getMyVehiclePartner);
partnerRouter.post("/documents", authCheck, rateLimitFor("submit"), addVehiclePartnerDocument);
partnerRouter.post("/contract", authCheck, acceptVehiclePartnerContract);

// ตั้งค่าหลังได้รับอนุมัติแล้วเท่านั้น
partnerRouter.patch("/settings", authCheck, requireVehiclePartner, updateVehiclePartnerSettings);

export default partnerRouter;
