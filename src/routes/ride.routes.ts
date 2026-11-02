import { Router } from "express";
import authCheck, { optionalAuth } from "../middleware/error.middleware";
import {
  cancelRideJob,
  createRideJob,
  createRideSos,
  getRideJob,
  listMyRideJobs,
  listRideAddons,
  listRideMessages,
  listRideSos,
  listRideTiers,
  payRideJob,
  quoteRide,
  rateRideJob,
  sendRideMessage,
} from "../controllers/ride.controllers";

/**
 * เส้นทางฝั่งผู้ใช้ (rider) — แยกจากโดเมน transport โดยสิ้นเชิง
 * เปิดให้ดูชั้นราคา/คิดราคาได้ก่อน login แต่การสร้างงานต้องมี token
 */
const rideRouter = Router();

// ---------- แคตตาล็อก (ไม่ต้อง login) ----------
rideRouter.get("/ride-tiers", listRideTiers);
rideRouter.get("/rides/addons", listRideAddons);
rideRouter.post("/rides/quote", optionalAuth, quoteRide);

// ---------- ต้อง login ----------
rideRouter.use("/rides", authCheck);

rideRouter.get("/rides/jobs", listMyRideJobs);
rideRouter.post("/rides/jobs", createRideJob);
rideRouter.get("/rides/jobs/:id", getRideJob);
rideRouter.post("/rides/jobs/:id/cancel", cancelRideJob);
rideRouter.post("/rides/jobs/:id/pay", payRideJob);
rideRouter.post("/rides/jobs/:id/rate", rateRideJob);

// แชท (rider + driver ใช้ร่วมกัน)
rideRouter.get("/rides/jobs/:id/messages", listRideMessages);
rideRouter.post("/rides/jobs/:id/messages", sendRideMessage);

// SOS
rideRouter.post("/rides/jobs/:id/sos", createRideSos);
rideRouter.get("/rides/jobs/:id/sos", listRideSos);

export default rideRouter;
