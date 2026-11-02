import { Router } from "express";
import authCheck from "../middleware/error.middleware";
import {
  acceptRideJob,
  addDriverDocument,
  addDriverVehicle,
  applyDriver,
  arriveRideJob,
  collectPayment,
  completeRideJob,
  confirmDelivery,
  deleteDriverVehicle,
  getDriverMe,
  listAvailableJobs,
  listDriverDocuments,
  listDriverVehicles,
  listMyEarnings,
  setDriverStatus,
  startRideJob,
  updateDriverLocation,
  updateDriverVehicle,
} from "../controllers/driver.controllers";

/**
 * ฝั่งคนขับ — สมัครได้ด้วยบัญชี User เดียวกับผู้โดยสาร
 * ไม่ต้องมีระบบ login แยก
 */
const driverRouter = Router();

driverRouter.use(authCheck);

// ---------- สมัคร / โปรไฟล์ (ทำได้ก่อนได้รับอนุมัติ) ----------
driverRouter.post("/apply", applyDriver);
driverRouter.get("/me", getDriverMe);
driverRouter.get("/documents", listDriverDocuments);
driverRouter.post("/documents", addDriverDocument);
driverRouter.get("/vehicles", listDriverVehicles);
driverRouter.post("/vehicles", addDriverVehicle);
driverRouter.patch("/vehicles/:id", updateDriverVehicle);
driverRouter.delete("/vehicles/:id", deleteDriverVehicle);

// ---------- เปิดรับงาน / พิกัด ----------
driverRouter.patch("/status", setDriverStatus);
driverRouter.post("/location", updateDriverLocation);

// ---------- งาน ----------
driverRouter.get("/jobs/available", listAvailableJobs);
driverRouter.post("/jobs/:id/accept", acceptRideJob);
driverRouter.post("/jobs/:id/arrive", arriveRideJob);
driverRouter.post("/jobs/:id/start", startRideJob);
driverRouter.post("/jobs/:id/complete", completeRideJob);
driverRouter.post("/jobs/:id/confirm-delivery", confirmDelivery);
driverRouter.post("/jobs/:id/collect-payment", collectPayment);

// ---------- รายได้ ----------
driverRouter.get("/earnings", listMyEarnings);

export default driverRouter;
