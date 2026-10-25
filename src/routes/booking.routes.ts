import { Router } from "express";
import authCheck, { optionalAuth } from "../middleware/error.middleware";
import { rateLimitFor } from "../middleware/rateLimit.middleware";
import {
  cancelBooking,
  changeBookingDates,
  createBooking,
  createPackageBooking,
  createReview,
  listMyBookings,
  listReviews,
  stayAvailability,
  stayCalendar,
} from "../controllers/booking.controllers";

const bookingRouter = Router();

// รีวิวของที่พัก — ดูได้โดยไม่ต้อง login
bookingRouter.get("/stays/:id/reviews", optionalAuth, listReviews);
bookingRouter.post("/stays/:id/reviews", authCheck, rateLimitFor("submit"), createReview);

// ห้องว่างของที่พักในช่วงวันที่ (ดูได้โดยไม่ต้อง login)
bookingRouter.get("/stays/:id/availability", optionalAuth, stayAvailability);
bookingRouter.get("/stays/:id/calendar", optionalAuth, stayCalendar);

bookingRouter.get("/me", authCheck, listMyBookings);
bookingRouter.post("/", authCheck, rateLimitFor("submit"), createBooking);
bookingRouter.post("/package", authCheck, rateLimitFor("submit"), createPackageBooking);
bookingRouter.post("/:id/cancel", authCheck, cancelBooking);
bookingRouter.patch("/:id", authCheck, rateLimitFor("submit"), changeBookingDates);

export default bookingRouter;