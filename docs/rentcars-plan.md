# RentCars — แผนงานที่เหลือ (ค้างไว้ ทำต่อเมื่อสั่ง "rentcars")

> สถานะ ณ 2026-10-30: Phase 1–6 ทำเสร็จแล้ว (API ครบวงจร + หน้าเว็บลูกค้า)
> ไฟล์นี้คือ "แผนที่เหลือ" — เมื่อผู้ใช้สั่งให้ทำ rentcars ให้ทำตามลำดับนี้จนจบ

## ลำดับที่ตกลงกัน (ทำตามนี้เท่านั้น)

```
P0  →  A1 + A2  →  P1  →  P2  →  P3  →  P4 / P6  →  P5
```

เหตุผล: A1/A2 ต้องมาก่อน P1 เพราะถ้าปล่อยให้พาร์ทเนอร์เริ่มใช้ระบบ
แล้วรถถูกล็อกค้างจากการจองทิ้ง หรือมีการจองซ้ำ ข้อมูลจะเสียตั้งแต่แรก

## P0 — บั๊กข้อมูลเพี้ยน (ต้องปิดก่อน)

- [ ] **My Trips รองรับรถเช่า** (`front/src/app/[locale]/mytrips/page.tsx`)
  - แยก branch ตาม `item.type === "TRANSPORT"`
  - แสดง `rentalDetail.vehicle` / `rentalDetail.branch` แทน `item.stay`
  - แสดงสถานะจาก `rentalDetail.status` (PENDING_PARTNER / RESERVED / PAID / PICKED_UP / RETURNED / COMPLETED / CANCELLED / REJECTED / NO_SHOW)
  - ปุ่มยกเลิก → `apiCancelRentalBooking(bookingId)` (`POST /bookings/rental/:id/cancel`)
- [ ] **กันการจองรถหลุดเข้า cancel ของที่พัก** (`back/src/services/booking.services.ts::cancelBookingService`)
  - ถ้า `booking.type !== "STAY"` → throw (หรือ route ไป logic ที่ถูก)
  - เช่นเดียวกันกับ `changeBookingDatesService` และ `createReviewService` (stay-only)

## A1 — กันการจองทิ้งเพื่อล็อกรถ (inventory lock)

- [ ] `PENDING_PARTNER` มีวันหมดอายุ (เช่น 30–60 นาที ตั้งใน `PlatformSetting`)
  - job ใหม่ `src/jobs/rentalExpiry.ts` (ตามแบบ `draftCleanup.ts`)
  - หมดอายุ → `RentalDetail.status = CANCELLED`, `Booking.status = CANCELLED`, ใส่เหตุผลใน note
- [ ] จำกัดจำนวน pending ต่อผู้ใช้ (เช่น ≤ 3) ตอน `createRentalBookingService`
- [ ] อย่านับ `PENDING_PARTNER` เป็นตัวบล็อกถ้าเลยกำหนดแล้ว (filter ตาม `createdAt`)

## A2 — กันการจองซ้ำ (race condition)

- [ ] ย้าย `findVehicleConflict` เข้าไป **ใน** `prisma.$transaction` ของ `createRentalBookingService`
  (ตอนนี้เช็คก่อนเปิด transaction → จองพร้อมกันอาจผ่านทั้งคู่)
- [ ] ใช้ row lock (`SELECT ... FOR UPDATE` ผ่าน `$queryRaw`) หรือตาราง lock ต่อ `vehicleId`
- [ ] `approveRentalService` ต้อง re-check conflict ใน transaction ด้วย (ตอนนี้เช็คแล้วแต่นอก tx)

## P1 — UI ฝั่งพาร์ทเนอร์รถเช่า (ยังไม่มีเลย)

- [ ] หน้า `front/src/app/[locale]/partner/...` (ต้องมี route + nav)
  - สมัครบริษัท (POST /partner/apply) + อัปโหลดเอกสาร + เซ็นสัญญา
  - จัดการสาขา (CRUD)
  - จัดการรถ (CRUD + อัปโหลดรูป + submit เข้าตรวจ)
  - ปฏิทิน + ปิดช่วงเวลา (blocks)
  - คิวจอง: อนุมัติ / ตีกลับ / บันทึกรับเงิน / รับรถ / คืนรถ / ปิดงาน / no-show
  - หน้าสรุป earnings (`GET /partner/earnings`)
  - สวิตช์ autoApprove
- [ ] เพิ่ม API client ใน `mainApi.ts` ให้ครบทุก endpoint ของ partner

## P2 — UI ฝั่งแอดมิน

- [ ] หน้า admin: ตรวจ partner (list / verify / reject / ปรับค่าคอม)
- [ ] หน้า admin: คิวตรวจรถ (`GET /admin/vehicles`, approve / reject + reason)

## P3 — เงินที่พาร์ทเนอร์ควรได้ (ค้าง PENDING ตลอด)

- [ ] `PartnerEarning.status` → `PAID` (endpoint ฝั่ง admin + วันที่จ่าย)
- [ ] payout/รอบจ่ายของ partner (สเปกเดิม: `/partner/payouts/request`)
- [ ] ใบเสร็จค่าคอมให้ partner

## P4 — งานอัตโนมัติ

- [ ] NO_SHOW อัตโนมัติ (job): `RESERVED` เลยเวลา pickup → `NO_SHOW`

## P6 — ความสมบูรณ์ฝั่งลูกค้า

- [ ] partner หยุดขายรถชั่วคราวได้ (`Vehicle.status = PAUSED/MAINTENANCE` ผ่าน PATCH)
- [ ] รีวิวรถ (endpoint + `Review.vehicleId`) + แสดง rating จริง
- [ ] หน้ารายละเอียดรถ `/rentcars/[id]`
- [ ] ฟิลเตอร์ขั้นสูงใน UI: `q, branchId, transmission, minSeats, maxPrice`

## P5 — field ที่ยังไม่ทำงาน (รอออเดอร์จริงก่อน)

- [ ] add-on คิดเงินจริง (quote/commission)
- [ ] `insuranceType` / `fuelPolicy` (endpoint + UI)
- [ ] `ratePlan` weekly/monthly
- [ ] `VehicleDocument` endpoints
- [ ] admin ปรับ `PlatformSetting` (VAT / late fee / grace) ผ่าน API

---

## ยังไม่รวมในแผนนี้ (ต้องคุยก่อน — กลุ่ม A/B/C ที่เหลือ)

- A3 ตรวจใบขับขี่/ตัวตนผู้เช่า
- A4 VAT/commission ของ late fee
- A5 ระเบียนคืนเงินจริง (`PaymentType.REFUND`)
- A6 เลขรันใบเสร็จ
- B7 tests/CI · B8 notification · B9 audit log · B10 rate limit + pagination
- B11 อัปโหลดรูปรถ · B12 i18n · B13 monitoring
- C14 rental agreement/PDPA · C15 ใบกำกับ/ใบเสร็จ

## ข้อมูลอ้างอิง

- สเปกหลัก: `back/docs/rental-partner-spec.md`
- Backend: `back/src/services/rentalBooking.services.ts`, `partnerVehicle.services.ts`, `vehicleCatalog.services.ts`, `back/src/lib/rentalPricing.ts`
- Frontend: `front/src/app/[locale]/rentcars/page.tsx`, `front/src/app/Api/mainApi.ts`
- Commits: back `7719cc0`, `b711e8c`, `769625c`, `c34c53f`, `f07caeb` · front `2ada26c`
