import { Router } from "express";
import authCheck from "../middleware/error.middleware";
import { requireVehiclePartner } from "../middleware/vehiclePartner.middleware";
import {
  createPartnerBranch,
  createPartnerVehicle,
  createPartnerVehicleBlock,
  deactivatePartnerBranch,
  deletePartnerVehicle,
  deletePartnerVehicleBlock,
  getPartnerVehicle,
  listPartnerBranches,
  listPartnerVehicles,
  partnerVehicleCalendar,
  submitPartnerVehicle,
  updatePartnerBranch,
  updatePartnerVehicle,
} from "../controllers/partnerVehicle.controllers";

const partnerVehicleRouter = Router();

// ทุกเส้นทางต้องเป็นพาร์ทเนอร์รถเช่าที่ผ่านการยืนยันแล้ว
partnerVehicleRouter.use(authCheck, requireVehiclePartner);

// ---------- สาขา ----------
partnerVehicleRouter.get("/branches", listPartnerBranches);
partnerVehicleRouter.post("/branches", createPartnerBranch);
partnerVehicleRouter.patch("/branches/:id", updatePartnerBranch);
partnerVehicleRouter.delete("/branches/:id", deactivatePartnerBranch);

// ---------- รถ ----------
partnerVehicleRouter.get("/vehicles", listPartnerVehicles);
partnerVehicleRouter.post("/vehicles", createPartnerVehicle);
partnerVehicleRouter.get("/vehicles/:id", getPartnerVehicle);
partnerVehicleRouter.patch("/vehicles/:id", updatePartnerVehicle);
partnerVehicleRouter.post("/vehicles/:id/submit", submitPartnerVehicle);
partnerVehicleRouter.delete("/vehicles/:id", deletePartnerVehicle);

// ---------- ปฏิทิน / ปิดช่วงเวลา ----------
partnerVehicleRouter.get("/vehicles/:id/calendar", partnerVehicleCalendar);
partnerVehicleRouter.post("/vehicles/:id/blocks", createPartnerVehicleBlock);
partnerVehicleRouter.delete("/blocks/:blockId", deletePartnerVehicleBlock);

export default partnerVehicleRouter;
