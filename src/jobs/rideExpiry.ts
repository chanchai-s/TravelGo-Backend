import { expireStaleRideJobs } from "../services/rideJob.services";

const CHECK_EVERY_MINUTE = 60 * 1000;

// งานที่ไม่มีคนขับรับภายใน TTL (PlatformSetting: ride_request_ttl_minutes) → EXPIRED
// ใช้ setInterval ง่าย ๆ เหมือน draftCleanup ไม่ต้องเพิ่ม dependency ใหม่
export function startRideExpiry() {
  setInterval(() => {
    expireStaleRideJobs().catch((error) => {
      console.error("[rideExpiry] หมดเวลางานไม่สำเร็จ:", error.message);
    });
  }, CHECK_EVERY_MINUTE);

  console.log("[rideExpiry] ตรวจงานที่รอคนขับเกินเวลาทุก 1 นาที");
}

export { expireStaleRideJobs };
