import express from "express";
import authCheck from "../middleware/error.middleware";
import { listActivities, getActivity, createActivityBooking, adminCreateActivity, adminUpdateActivity, adminDeleteActivity, adminApproveActivity, adminRejectActivity, hostSubmitActivity, hostListActivities } from "../controllers/activities.controllers";

const router = express.Router();

router.get("/activities", listActivities);
router.get("/activities/:id", getActivity);
router.post("/activities/:id/book", authCheck, createActivityBooking);

router.post("/admin/activities", authCheck, adminCreateActivity);
router.patch("/admin/activities/:id", authCheck, adminUpdateActivity);
router.delete("/admin/activities/:id", authCheck, adminDeleteActivity);
router.post("/admin/activities/:id/approve", authCheck, adminApproveActivity);
router.post("/admin/activities/:id/reject", authCheck, adminRejectActivity);

router.post("/host/activities", authCheck, hostSubmitActivity);
router.get("/host/activities", authCheck, hostListActivities);

export default router;
