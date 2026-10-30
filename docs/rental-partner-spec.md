# Rental Partner (Vehicle Partner) — Spec

## Scope (locked)

- Partner = **บริษัท (นิติบุคคล) เท่านั้น** — แยกจาก `HostProfile` (เจ้าของที่พัก) โดยสิ้นเชิง
- หลายสาขาได้ตั้งแต่แรก (`PartnerBranch`)
- MVP: **self-drive, รายวัน, รับ-คืนสาขาเดียว**
- เผื่ออนาคต (มี field แต่ยังไม่เปิด): chauffeur, one-way, delivery, รายสัปดาห์/เดือน
- รถมีหลายประเภท → `VehicleCategory` (data-driven) + `Vehicle.specs` (JSON)
- การจอง: ลูกค้าจองได้ทันที (instant) แล้วส่งเข้า partner
  - partner ตั้ง `autoApprove` ได้: `true` = อนุมัติอัตโนมัติ, `false` = ต้องกดอนุมัติเอง
- การชำระเงิน: จ่าย **มัดจำ + ค่าเช่า ที่สาขา** (MVP ไม่ต่อ payment gateway)

## Money rules

| รายการ | กติกา |
|---|---|
| มัดจำ | partner กำหนดเองต่อคัน (`Vehicle.depositAmount`) |
| VAT | 7% (`PlatformSetting.vat_rate`) — ราคารวม VAT, แตก `baseAmount` + `vatAmount` |
| ใบกำกับภาษี | partner ออกในนามบริษัท; แพลตฟอร์มออกใบเสร็จค่าคอมให้ partner |
| ค่าคอม | ต่อบริษัท (`VehiclePartner.commissionRate`), แอดมินปรับได้ + `CommissionChangeLog` |
| ฐานค่าคอม | ค่าเช่า + add-on ก่อน VAT (ไม่รวมมัดจำ) |
| Late fee | เกิน 60 นาที → 200 บาท/ชั่วโมง ไม่มีเพดาน (`late_fee_per_hour`, `late_grace_minutes`) |
| คืนก่อนกำหนด | คืนมัดจำเต็ม, ไม่คืนค่าเช่าส่วนที่เหลือ |
| ยกเลิกหลังจ่ายแล้ว | คืนมัดจำ, ค่าเช่าไม่คืน |
| NO_SHOW | ยึดมัดจำ; ถ้ายังไม่จ่ายมัดจำ = ยกเลิกเปล่า |

## Booking status

```
PENDING_PARTNER ──partner อนุมัติ/autoApprove──> RESERVED
RESERVED ──จ่ายที่สาขา──> PAID ──รับรถ──> PICKED_UP ──คืนรถ──> RETURNED ──ตรวจ+คืนมัดจำ──> COMPLETED
PENDING_PARTNER ──partner ปฏิเสธ──> REJECTED
RESERVED/PAID ──ยกเลิก──> CANCELLED
RESERVED ──ไม่มาจ่ายตามเวลา (job)──> NO_SHOW
```

## Data model (Phase 1 — implemented)

`VehiclePartner`, `PartnerBranch`, `VehiclePartnerDocument`, `VehicleCategory`,
`Vehicle` (+ `specs`, `depositAmount`, `branchId`, `categoryId`, `status`),
`VehiclePhoto`, `VehicleDocument`, `VehicleBlock`, `RentalDetail`, `Payment`,
`PartnerEarning`, `CommissionChangeLog`, `PlatformSetting`

เพิ่ม relation: `User.vehiclePartner`, `Booking.rentalDetail`, `Review.vehicleId`

## API

### Phase 2 — partner onboarding + admin approval (ทำแล้ว)

- `POST /partner/apply` — สมัคร/แก้ข้อมูลบริษัท (PENDING) · ยืนยันแล้วแก้ได้แค่ข้อมูลติดต่อ
- `GET /partner/me` — สถานะ + เอกสาร + สาขา + จำนวนรถ
- `POST /partner/documents` — `{ type, url }` โดย type ∈ `COMPANY_CERT | VAT_CERT | BOOK_BANK | ID_CARD | OTHER`
- `POST /partner/contract` — ยอมรับข้อตกลง (`v1`)
- `PATCH /partner/settings` — `{ autoApprove }` (ต้อง VERIFIED)
- Admin: `GET /admin/partners`, `POST /admin/partners/:id/verify|reject|commission`
  - verify → เอกสาร PENDING ทั้งหมดเป็น APPROVED + `ModerationLog`
  - commission → บันทึก `CommissionChangeLog` (oldRate/newRate/changedBy)

### Phase 3 — สาขา/รถ/ปฏิทิน + แคตตาล็อกสาธารณะ (ทำแล้ว)

- Partner: `GET|POST /partner/branches`, `PATCH|DELETE /partner/branches/:id` (DELETE = ปิดใช้งาน soft)
- Partner: `GET|POST /partner/vehicles`, `GET|PATCH|DELETE /partner/vehicles/:id`
- Partner: `POST /partner/vehicles/:id/submit` (DRAFT/REJECTED/PAUSED → PENDING, ต้องมีรูป ≥ 1)
- ลบรถ: ถ้าเคยมีการจอง → `SUSPENDED`; ถ้ามีการจองที่ยังไม่จบ → ห้ามลบ
- Partner: `GET /partner/vehicles/:id/calendar`, `POST /partner/vehicles/:id/blocks`, `DELETE /partner/blocks/:blockId`
- Admin: `GET /admin/vehicles`, `POST /admin/vehicles/:id/approve|reject`
- Public: `GET /vehicle-categories`, `GET /vehicles`, `GET /vehicles/:id`, `GET /vehicles/:id/availability`, `POST /vehicles/:id/quote`
  - `GET /vehicles` กรองตาม `q, category, branchId, pickupAt, dropoffAt, transmission, minSeats, maxPrice, page, size`
  - ถ้าส่งช่วงวันที่ → ตัดรถที่ถูกจอง/ปิดปฏิทินออก
  - quote คิด VAT 7% (แตก base/vat) + มัดจำ; ไม่ส่งค่า commission ออกให้ลูกค้า

### Phase 4 (ยังไม่ทำ)

- Partner: `/partner/vehicles/:id/bookings` (รายการจองของรถ), `/partner/bookings`
- Booking: `POST /bookings` (type `TRANSPORT`), approve/reject, pay-at-branch, pickup, return, cancel

## Notes

- `prisma db push` ยังติดปัญหา FK index drift เดิมของโปรเจกต์ → ใช้ `prisma/partner_schema.sql` ผ่าน `prisma db execute`
- DB เดิมไม่มี FK constraint เลย → partner domain เพิ่มด้วย `prisma/partner_fk.sql` (cascade ตาม schema)
- Seed: `npm run seed` (สร้าง 8 categories, 1 partner, 2 branches, 5 vehicles, 4 settings)
