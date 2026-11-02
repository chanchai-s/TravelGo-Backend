import { Router } from "express";
import authCheck, { requireAdmin } from "../middleware/error.middleware";
import {
  ackSosEvent,
  adminCancelRide,
  closeSosEvent,
  listDrivers,
  listRideTiers,
  listRides,
  listSosEvents,
  rejectDriver,
  reviewDriverDocument,
  setDriverCommission,
  updateRideTier,
  verifyDriver,
} from "../controllers/adminRide.controllers";
import { listSavedAddresses } from "../controllers/savedAddress.controllers";

/** ops console ของ ride — ใช้ /admin ชุดเดียวกับโดเมนอื่น */
const adminRideRouter = Router();

adminRideRouter.use(authCheck, requireAdmin);

// ---------- คนขับ ----------
adminRideRouter.get("/drivers", listDrivers);
adminRideRouter.post("/drivers/:id/verify", verifyDriver);
adminRideRouter.post("/drivers/:id/reject", rejectDriver);
adminRideRouter.post("/drivers/:id/commission", setDriverCommission);
adminRideRouter.post("/documents/:id/review", reviewDriverDocument);

// ---------- งาน ----------
adminRideRouter.get("/rides", listRides);
adminRideRouter.post("/rides/:id/cancel", adminCancelRide);

// ---------- SOS ----------
adminRideRouter.get("/rides/sos", listSosEvents);
adminRideRouter.post("/rides/sos/:id/ack", ackSosEvent);
adminRideRouter.post("/rides/sos/:id/close", closeSosEvent);

// ---------- ชั้นราคา ----------
adminRideRouter.get("/ride-tiers", listRideTiers);
adminRideRouter.patch("/ride-tiers/:code", updateRideTier);

// ---------- ที่อยู่ของผู้ใช้ (เผื่อ ops ตรวจสอบ) ----------
adminRideRouter.get("/saved-addresses", listSavedAddresses);

export default adminRideRouter;
