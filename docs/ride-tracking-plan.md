# Ride & Logistics (เรียกรถ / ขนส่ง) — แผนการทำงาน Frontend / Backend (v2)

> สถานะ: **แผน (ยังไม่เริ่มเขียนโค้ด)**
> ขอบเขต: **แบบ Bolt / Grab / 365truck** — engine เดียวรองรับ **RIDE (ขนคน)** และ **PARCEL (ขนของ/logistics)**
> ลำดับส่งมอบ: RIDE ให้จบก่อน แล้วต่อ PARCEL บน engine เดิม (schema ออกแบบรองรับทั้งคู่ตั้งแต่ต้น)
> โดเมนแยกจาก `transport` (รถไฟ) โดยสิ้นเชิง
> ดีไซน์อ้างอิง: Stitch project `10575193888406634998` — ดึงไว้ที่ `D:\Travel\design\stitch\`

## 1. ข้อตัดสินใจที่ล็อกแล้ว (2026-11-02)

| # | เรื่อง | สรุป |
|---|---|---|
| 1 | ชื่อโดเมน | **`ride`** (ไม่ใช้ `transport`) |
| 2 | แผนที่ | **Leaflet + OpenStreetMap** (ฟรี) + OSRM คิดเส้นทาง (ธีมแผนที่มืด) |
| 3 | Realtime | **Socket.IO** ใช้ทั้ง tracking + chat (แทน SSE) |
| 4 | การจ่ายเงิน | **รองรับทั้ง 2 แบบ**: จ่ายในแอป (prepay) และเงินสด/โอนให้คนขับ (postpay) |
| 5 | การจับคู่ | คนขับกดรับงานเองจากบอร์ด (auto-assign ทีหลัง) |
| 6 | ขอบเขต | **RIDE + PARCEL + LOGISTICS** ใน engine เดียว |
| 7 | OTP สมัคร | email/password + OTP เบอร์แบบ dev mode (log รหัส) |
| 8 | บัญชีผู้ใช้ | rider = User เดิม · driver = User เดิม + `DriverProfile` |
| 9 | Add-on | เพิ่มตาราง `RideAddon` (ประกัน / คาร์ซีท / VIP escort / ยกของ) |
| 10 | Tier รถ | แยก **tier = ชั้นราคา** ออกจาก **vehicleType = ชนิดรถ** (ตาราง `RideTier`) |
| 11 | แชท | **Socket.IO** ใน R5 |
| 12 | แบรนด์/สไตล์ | ใช้ธีม The Residence (ดำ-ขาว-มินิมอล) + สีฟ้าเดิม `#0050cb` + คอรัล `#ff5722` |
| 13 | แพลตฟอร์ม | **mobile-first responsive (PWA ก่อน)** — โครงสร้างโค้ดเผื่อ React Native ในอนาคต |
| 14 | สกุลเงิน | ฿ + i18n th/en ของเดิม (ไม่ทำ USD toggle) |

## 2. หลักการ

- **บัญชีเดียว**: `User` ใช้จองที่พัก / เช่ารถ / เรียกรถ / ส่งของ / สมัครเป็นคนขับ
- **engine เดียว 3 บริการ**: `RideJob` เดียว แยกด้วย `serviceType = RIDE | PARCEL | LOGISTICS`
  - `PARCEL` = ส่งของชิ้นเดียว/หลายชิ้น (motorcycle → 10 ล้อ)
  - `LOGISTICS` = เหมารถทั้งคัน / หลายจุดส่ง (ใช้ทีหลัง)
- **Tier ≠ ชนิดรถ**: `RideTier` เก็บราคา/ที่นั่ง/ขนาดที่รับได้, `DriverVehicle.type` เก็บชนิดรถจริง
- **คนขับ 1 คนรับได้หลายบริการ**: `serviceTypes` + `tierCodes` ที่ลงทะเบียนไว้
- **โดเมนแยก**: ไม่ปนกับ `Transport` (รถไฟ), `RentalDetail` (รถเช่า) หรือ `Booking` (ที่พัก)
- **เงินเป็น Int (บาท)**: ไม่ใช้ทศนิยม, VAT แตก base/vat เหมือน rentcars
- **Service ถือ business rule**: controller ทำแค่ map HTTP ↔ service

## 3. แนวทางการเขียนโค้ด (เหมือนของเดิมในโปรเจกต์)

- `export async function xxxService(...)` ธรรมดา — ไม่ใช้ class / repository / DI
- คอมเมนต์ภาษาไทยสั้น ๆ เฉพาะจุดที่อธิบาย "ทำไม"
- helper เล็ก ๆ ไว้บนไฟล์: `text()`, `optionalText()`, `optionalInt()`, `parseDate()`
- error = `throw new Error("ข้อความภาษาไทย")` → controller แปลงเป็น status ด้วย regex
- controller ตอบ JSON ตรง: `res.json({ success, message, data })` — ไม่ส่งต่อ `next()`
- เปลี่ยนหลายตารางพร้อมกัน → `prisma.$transaction(async (tx) => ...)`
- middleware ที่ต้องมี: `driverCheck` (แบบ `authCheck` / `requireVehiclePartner`) ใช้ `import` ปกติ
- เช็กเจ้าของงานใน service (แบบ `ownedRental()`) ไม่ต้องมี middleware เจ้าของ

## 4. Vehicle catalog (RIDE + LOGISTICS)

เทียบมาตรฐาน Grab / Bolt / 365truck — ใช้ `DriverVehicleType` + `RideTier`

### 4.1 RIDE (ขนคน)

| Tier | ชนิดรถ | ที่นั่ง | ใช้เป็น |
|---|---|---|---|
| `MOTO` | MOTORCYCLE | 1 | ไปเร็ว/รถติด |
| `ECO` | CAR (sedan/hatchback) | 4 | ประหยัด |
| `EXECUTIVE` | CAR (EV/premium sedan) | 4 | แนะนำ/ยอดนิยม |
| `SUV` | SUV | 6 | ครอบครัว/ภูเขา |
| `VIP_VAN` | VAN | 7–9 | สนามบิน/กรุ๊ป |
| `LUXURY` | CAR (Porsche ฯลฯ) | 4 | พรีเมียม |

### 4.2 PARCEL / LOGISTICS (ขนของ)

| Tier | ชนิดรถ | น้ำหนักสูงสุด | ขนาดกระบะโดยประมาณ | ใช้กับ |
|---|---|---|---|---|
| `PARCEL_MOTO` | MOTORCYCLE | 20 กก. | 40×40×40 ซม. | เอกสาร/ของชิ้นเล็ก |
| `PARCEL_PICKUP` | PICKUP | 1,000 กก. | 2.4×1.5×0.5 ม. | ของใช้ในบ้าน/เฟอร์นิเจอร์ชิ้นเล็ก |
| `PARCEL_VAN` | VAN | 800 กก. | 2.8×1.6×1.7 ม. | กล่องหลายใบ/ของสูง |
| `PARCEL_6W` | TRUCK_6W | 3,500 กก. | 4.5×2.0×1.5 ม. | ย้ายร้าน/ของจำนวนมาก |
| `PARCEL_10W` | TRUCK_10W | 10,000 กก. | 6.5×2.3×2.0 ม. | สินค้าส่งคลัง |
| `PARCEL_TRAILER` | TRAILER | 25,000 กก. | 12×2.4×2.6 ม. | เหมาคัน/ข้ามจังหวัด |
| `PARCEL_COLD` | REFRIGERATED | 3,000 กก. | 4.5×2.0×1.8 ม. | อาหาร/ยา (เฟสหลัง) |

**กติกาการจับคู่**: งาน PARCEL จะเห็นเฉพาะคนขับที่ `vehicleType` ตรง + `maxWeightKg`/ขนาด เพียงพอ + เปิด `isOnline`

### 4.3 รถที่ต้องเตรียมข้อมูลตอน seed

- ทุก tier ต้องมี: `baseFare`, `perKm`, `perMin`, `minFare`, `seats`/`maxWeightKg`, `maxDimension`
- LOGISTICS (เหมาคัน) ใช้ `RideTier` เดียวกัน แต่คิดราคาแบบเหมา (`flatFare` + ค่าเกิน กม.)

## 5. Payment model (รองรับ 2 ทาง)

```
PaymentTiming = PREPAY | POSTPAY
PaymentMethod = CARD | PROMPTPAY | WALLET | CASH | TRANSFER
PaymentStatus = PENDING | AUTHORIZED | PAID | REFUNDED | FAILED
```

| แบบ | Flow | ใครได้เงิน | commission |
|---|---|---|---|
| **PREPAY (ในแอป)** | quote → checkout → ชำระ → สร้างงาน (PAID) → จบงาน | platform ถือเงิน แล้วโอนให้คนขับรอบถัดไป | หักตอนโอน |
| **POSTPAY (เงินสด/โอน)** | quote → สร้างงาน → คนขับรับ → จบงาน → เก็บเงิน → mark paid | คนขับเก็บเอง | platform เก็บยอดค้าง (ledger) |

- `RidePayment` เก็บ `timing`, `method`, `status`, `amount`, `baseAmount`, `vatAmount`
- `DriverEarning.status`: `PENDING` (ยังไม่หัก commission) → `SETTLED`
- PREPAY ต้องมี payment gateway — เฟสแรกทำ **mock gateway** (สร้าง QR ปลอม + กดยืนยัน) แล้วค่อยต่อจริง

## 6. Realtime (Socket.IO)

```
namespace  /ride
room       job:{jobId}
events     location | status | chat | sos | joined
```

- **auth ผ่าน handshake** (`socket.handshake.auth.token` = JWT) → ไม่ต้องมี ticket แบบ SSE
- rider join room ตอนเปิดหน้าติดตาม, driver join ตอนรับงาน
- `location` ส่งทุก 3–5 วิ (คนขับ), server เก็บ `DriverLocation` + broadcast
- `chat` เก็บ `RideMessage` ก่อน broadcast (กันข้อความหาย)
- `sos` broadcast ถึง room + admin room
- fallback: ถ้า socket หลุด → client poll `GET /rides/jobs/:id` ทุก 5 วิ

## 7. Backend — โครงสร้างไฟล์

```
back/
├─ prisma/
│  ├─ schema.prisma            # + โมเดลใหม่ (ดู §10)
│  ├─ ride_schema.sql          # SQL apply (prisma db push ใช้ไม่ได้)
│  └─ seed.ts                  # + RideTier, PlatformSetting, คนขับทดสอบ
└─ src/
   ├─ routes/
   │  ├─ ride.routes.ts          # /rides/...        (rider)
   │  ├─ rideDriver.routes.ts    # /driver/...       (driver)
   │  └─ rideAdmin.routes.ts     # /admin/rides...   (admin)
   ├─ controllers/
   │  ├─ ride.controllers.ts
   │  ├─ rideDriver.controllers.ts
   │  └─ rideAdmin.controllers.ts
   ├─ services/
   │  ├─ rideJob.services.ts        # lifecycle + transaction
   │  ├─ rideDriver.services.ts     # onboarding / online / location
   │  ├─ rideFare.services.ts       # quote + addon + commission
   │  ├─ ridePayment.services.ts    # prepay / postpay / refund
   │  ├─ rideChat.services.ts       # message + read
   │  └─ rideSos.services.ts        # sos event
   ├─ lib/
   │  ├─ ridePricing.ts             # สูตรราคา + haversine
   │  ├─ rideRealtime.ts            # socket.io hub (init + rooms)
   │  └─ paymentGateway.ts          # mock gateway (เฟสแรก)
   ├─ middleware/
   │  └─ rideDriver.middleware.ts   # driverCheck
   ├─ jobs/
   │  ├─ rideExpiry.ts              # ไม่มีคนรับใน N นาที → EXPIRED
   │  └─ driverStale.ts             # ไม่ ping > 2 นาที → offline
   └─ server.ts                     # mount router + socket.io
```

### การไหลของ request

```
Route → authCheck → driverCheck → Controller → Service → Prisma
                                        ↓
                              res.json({ success, message, data })
```

## 8. Frontend — mobile-first

### 8.1 กลยุทธ์แพลตฟอร์ม

| ทาง | ข้อดี | ข้อเสีย | สรุป |
|---|---|---|---|
| **PWA / responsive web** | ใช้โค้ดเดิม, เร็ว, ติดตั้งได้ | push บน iOS จำกัด | ✅ **เริ่มที่นี่** |
| Capacitor (ห่อ WebView) | ขึ้น Store ได้เร็ว | กล้อง/แผนที่/performane จำกัด | ทางเลือกถ้าต้องขึ้น Store ปีนี้ |
| React Native (Expo) | native จริง | ต้องเขียน UI ใหม่หมด | ทำเมื่อธุรกิจนิ่ง |

**กติกาที่ต้องยึดตั้งแต่วันนี้ เพื่อให้ย้ายไป RN ได้ง่าย**
1. business logic อยู่ใน service/API + hook (`useRide`) ไม่ฝังใน page component
2. design token รวมที่ `globals.css` (`@theme`) ที่เดียว
3. component แยก dumb/presentational (รับ props) — ไม่เรียก API เอง
4. ใช้ `max-w-md` เป็นกรอบหลัก (แอปเป็น mobile) แล้วค่อยขยาย breakpoint `md:` สำหรับ desktop

### 8.2 โครงสร้างไฟล์

```
front/src/
├─ app/
│  ├─ Api/mainApi.ts                  # + ฟังก์ชัน ride (~25 ตัว)
│  ├─ Api/rideSocket.ts               # socket.io-client wrapper
│  ├─ stores/
│  │  ├─ auth.stores.ts               # user, token, login/logout
│  │  └─ ride.stores.ts               # currentJob, driverPos, messages
│  ├─ hooks/
│  │  ├─ useAuth.ts
│  │  └─ useRideTracking.ts           # ครอบ socket + fallback poll
│  ├─ components/ride/
│  │  ├─ ServiceToggle.tsx            # Ride / Parcel / Truck
│  │  ├─ MapView.tsx                  # Leaflet (dynamic import, ssr:false)
│  │  ├─ LocationPicker.tsx
│  │  ├─ TierPicker.tsx               # การ์ด tier + ราคา
│  │  ├─ FareBreakdown.tsx            # ฐาน + addon + VAT
│  │  ├─ AddonPicker.tsx
│  │  ├─ RideStatusStepper.tsx
│  │  ├─ DriverCard.tsx
│  │  ├─ ChatSheet.tsx                # R5
│  │  ├─ SosButton.tsx                # R5
│  │  ├─ ParcelForm.tsx               # R4
│  │  ├─ OtpBox.tsx                   # R4
│  │  └─ RatingSheet.tsx              # R4
│  └─ [locale]/
│     ├─ login/page.tsx                # login + register tabs (F0)
│     ├─ profile/page.tsx              # + SavedAddress (F0)
│     ├─ ride/
│     │  ├─ page.tsx                   # เลือกบริการ/จุด/tier → เรียก
│     │  ├─ [id]/page.tsx              # ติดตามสด + แชท + SOS
│     │  └─ history/page.tsx           # ประวัติ
│     ├─ driver/
│     │  ├─ register/page.tsx
│     │  ├─ status/page.tsx
│     │  ├─ dashboard/page.tsx         # online + บอร์ดงาน
│     │  ├─ job/[id]/page.tsx
│     │  └─ earnings/page.tsx
│     └─ admin/rides/
│        ├─ page.tsx                   # ภาพรวมงาน
│        ├─ drivers/page.tsx           # ตรวจคนขับ/เอกสาร
│        └─ sos/page.tsx               # เหตุฉุกเฉิน
```

### 8.3 แปลงดีไซน์ desktop → mobile (01/02/03/05)

| หน้า Stitch | ขนาด | แปลงเป็น mobile |
|---|---|---|
| 01 Ride-Hailing Suite | 2560 | คอลัมน์เดียว: จุดรับ-ส่ง → tier list → สรุปราคา → **sticky CTA ล่าง** · แผนที่ย่อเป็น peek ด้านบน (กดขยาย) |
| 02 Fleet Landing | 2560 | hero + การ์ด 2 คอลัมน์ → 1 คอลัมน์ · ตารางรถเลื่อนแนวนอน |
| 03 Live Tracking | 2560 | **แผนที่เต็มจอ + bottom sheet ลากได้** (คนขับ/stepper/ปุ่มโทร/SOS) |
| 05 Checkout Drawer | 2560 | drawer ข้าง → **bottom sheet** เต็มความกว้าง |
| 06 Registration | 780 | ใช้ได้เลย (mobile อยู่แล้ว) |
| 07 My Trips | 780 | ใช้ได้เลย |
| 08 Checkout | 780 | ใช้ได้เลย |

## 9. UI coverage — ดีไซน์ที่ดึงมา vs งานที่ต้องทำ

### 9.1 ดึงมาแล้ว 8 หน้า (`D:\Travel\design\stitch\`)

| ไฟล์ | หน้า | ใช้กับ |
|---|---|---|
| `01-ride-hailing-suite` | เลือกจุด/tier/ราคา + แผนที่ | `/ride` |
| `02-fleet-landing` | landing การตลาด | หน้าแนะนำบริการ |
| `03-live-tracking` | ติดตามสด + telemetry | `/ride/[id]` |
| `04-partner-onboarding` | สมัครพาร์ตเนอร์ + KYC + เอกสาร | `/driver/register` |
| `05-checkout-drawer` | review + breakdown + จ่าย | checkout sheet |
| `06-multi-role-registration` | สมัคร/ล็อกอิน (mobile) | `/login` |
| `07-my-trips` | ประวัติการเดินทาง (mobile) | `/ride/history` |
| `08-secure-checkout` | ชำระเงิน (mobile) | prepay flow |

### 9.2 หน้าที่ยังไม่มีดีไซน์ ต้องสร้างเอง (11 หน้า)

| # | หน้า | เฟส |
|---|---|---|
| 1 | Driver status (รอตรวจ/ถูกตีกลับ) | F1 |
| 2 | Admin ตรวจคนขับ + เอกสาร | F1 |
| 3 | Driver dashboard + บอร์ดงาน | F2 |
| 4 | Driver active job (รับ→ถึง→เริ่ม→จบ→เก็บเงิน) | F2 |
| 5 | Driver earnings | F4 |
| 6 | Profile + SavedAddress | F0 |
| 7 | Rating sheet | F4 |
| 8 | Parcel form + OTP + proof | F4 |
| 9 | โมดัลยกเลิกงาน (เลือกเหตุผล) | F2 |
| 10 | Empty/error states (ไม่มีคนขับ / หมดเวลา) | F2 |
| 11 | Admin SOS console | F5 |

## 10. Data model

```prisma
enum RideServiceType { RIDE PARCEL LOGISTICS }
enum RideStatus {
  REQUESTED SEARCHING ACCEPTED ARRIVING ARRIVED
  IN_PROGRESS COMPLETED CANCELLED EXPIRED
}
enum DriverStatus { PENDING VERIFIED REJECTED SUSPENDED }
enum DriverVehicleType {
  MOTORCYCLE CAR SUV VAN PICKUP
  TRUCK_6W TRUCK_10W TRAILER REFRIGERATED
}
enum PaymentTiming { PREPAY POSTPAY }
enum RidePaymentMethod { CARD PROMPTPAY WALLET CASH TRANSFER }
enum PaymentStatus { PENDING AUTHORIZED PAID REFUNDED FAILED }
enum ParcelSizeTier { S M L XL }
enum AddonType { INSURANCE CHILD_SEAT VIP_ESCORT EXTRA_STOP LOADING WAITING }
enum SosStatus { OPEN ACK CLOSED }

// --- ใหม่ ---
RideTier        id, code(unique), name, serviceType, vehicleType,
                seats?, maxWeightKg?, maxDimCm?,
                baseFare, perKm, perMin, minFare, flatFare?,
                isActive, sortOrder

DriverProfile   ...ของเดิม
                serviceTypes Json?        // ["RIDE","PARCEL"]
                tierCodes    Json?        // ["ECO","EXECUTIVE","PARCEL_VAN"]
                status DriverStatus @default(PENDING)
                isOnline Boolean @default(false)
                lastLat/lastLng Float?, lastLocationAt DateTime?
                rating Float @default(5), totalTrips Int @default(0)
                commissionRate Int?, verifiedAt DateTime?, rejectedReason String?

DriverVehicle   id, driverId, type(DriverVehicleType), tierCode,
                brand, model, plateNo, color, seats?, maxWeightKg?,
                photoUrl, isActive, createdAt
DriverDocument  id, driverId, type, url, status, reviewNote, reviewedAt
SavedAddress    id, userId, label, address, lat, lng, isDefault

RideJob         id, ref, riderId, driverId?, serviceType, tierCode, status,
                passengerCount?, pickupLat/Lng/Address, dropoffLat/Lng/Address,
                distanceKm, durationMin,
                baseFare, addonTotal, vatAmount, fareEstimate, fareFinal,
                commissionRate, commission, netToDriver,
                paymentTiming, paymentMethod, paymentStatus,
                requestedAt, acceptedAt, arrivedAt, startedAt, completedAt,
                cancelledAt, cancelReason, cancelBy
RideAddon       id, jobId, type(AddonType), name, amount, qty
ParcelDetail    jobId(1-1), weightKg, sizeTier, isFragile, receiverName,
                receiverPhone, note, pickupOtp, deliveryOtp,
                proofPhotoUrl, signatureUrl, codAmount
RideStatusLog   id, jobId, fromStatus, toStatus, byUserId, note, createdAt
DriverLocation  id, driverId, jobId?, lat, lng, bearing?, speed?, recordedAt
RidePayment     id, jobId, timing, method, status, type(FARE|ADDON|TIP|REFUND),
                amount, baseAmount, vatAmount, paidAt, gatewayRef
DriverEarning   id, jobId(unique), driverId, gross, commission, net,
                status(PENDING|SETTLED), paidAt, createdAt
RideRating      id, jobId(unique), riderId, driverId, stars, text, createdAt
RideMessage     id, jobId, senderId, text?, attachmentUrl?, readAt?, createdAt
RideSosEvent    id, jobId, userId, lat, lng, note?, status(SosStatus),
                handledBy?, handledAt?, createdAt
```

**Index**: `RideJob[serviceType, status, requestedAt]`, `RideJob[driverId, status]`,
`RideJob[riderId, requestedAt]`, `DriverLocation[jobId, recordedAt]`,
`DriverProfile[isOnline, lastLocationAt]`, `RideMessage[jobId, createdAt]`

**ไม่แตะ**: `BookingType.TRANSPORT` และหน้า `transport` เดิม

## 11. State machine + กติกา

```
REQUESTED → SEARCHING → ACCEPTED → ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED
                ↘ CANCELLED / EXPIRED

COMPLETED:
  RIDE      = ผู้โดยสารลง + ชำระเงิน (prepay แล้ว / postpay เก็บแล้ว)
  PARCEL    = ยืนยัน deliveryOtp + รูปหลักฐาน (+ COD ถ้ามี)
  LOGISTICS = หลายจุดส่งครบ + หลักฐานทุกจุด
```

| กติกา | รายละเอียด |
|---|---|
| ยกเลิก | rider ก่อน `IN_PROGRESS`; driver ก่อน `ARRIVED` (ต้องมีเหตุผล) |
| งานซ้อน | ห้าม — ต้องไม่มีงาน active (`ACCEPTED..IN_PROGRESS`) |
| ที่นั่ง | RIDE: `passengerCount ≤ tier.seats` |
| น้ำหนัก/ขนาด | PARCEL: ต้องไม่เกิน `tier.maxWeightKg` / `maxDimCm` |
| OTP | PARCEL/LOGISTICS: ยืนยัน `deliveryOtp` ก่อนปิดงาน |
| COD | `codAmount > 0` ต้องเก็บครบก่อนปิดงาน |
| Tracking | rider เห็นพิกัดเฉพาะ `ACCEPTED..IN_PROGRESS` |
| เก็บพิกัด | เฉพาะระหว่างงาน ≤ 30 วัน |

## 12. สูตรค่าโดยสาร

```
RIDE   fare = max(minFare, baseFare + distanceKm × perKm + durationMin × perMin)
PARCEL fare = RIDE formula + sizeFee + weightFee(เกิน 5 กก.)
LOGISTICS  = flatFare + (distanceKm − includedKm) × perKm

addonTotal = Σ RideAddon.amount
vatAmount  = round((fare + addonTotal) × 7 / 100)
totalFare  = fare + addonTotal + vatAmount

commission  = round(fare × commissionRate / 100)
netToDriver = fare − commission
```

- ค่าฐานอยู่ใน `RideTier` (แก้ผ่าน DB) + `PlatformSetting` สำหรับ VAT/commission
- **client ห้ามส่งราคามา** — server คิดจาก lat/lng + tier + addon
- `fareEstimate` = ตอนเรียก, `fareFinal` = ตอนจบ (ถ้ามีเปลี่ยนทาง)

## 13. API

| ฝั่ง | Endpoint | เฟส |
|---|---|---|
| auth | ซ่อม `POST /auth/register|login` (เก็บ password) · `POST /auth/otp/request|verify` · `POST /auth/set-password` | R0 |
| rider | `GET/POST/DELETE /saved-addresses` | R0 |
| rider | `GET /ride-tiers?serviceType=` | R2 |
| rider | `POST /rides/quote` (tier + addon + parcel detail) | R2 |
| rider | `POST /rides/jobs` · `GET /rides/jobs/:id` · `GET /rides/jobs` | R2 |
| rider | `POST /rides/jobs/:id/cancel` · `POST /rides/jobs/:id/rate` | R2/R4 |
| rider | `POST /rides/jobs/:id/pay` (prepay, mock gateway) | R2 |
| rider | `POST /rides/jobs/:id/sos` | R5 |
| driver | `POST /driver/apply` · `GET /driver/me` · `POST /driver/documents` · `POST /driver/vehicles` | R1 |
| driver | `PATCH /driver/status` · `POST /driver/location` | R2 |
| driver | `GET /driver/jobs/available?serviceType=` · `POST /driver/jobs/:id/accept|arrive|start|complete` | R2 |
| driver | `POST /driver/jobs/:id/confirm-delivery` (OTP + รูป + COD) | R4 |
| driver | `POST /driver/jobs/:id/collect-payment` · `GET /driver/earnings` | R2/R4 |
| chat | `GET /rides/jobs/:id/messages` + Socket.IO `chat` | R5 |
| admin | `GET /admin/drivers` · `POST /admin/drivers/:id/verify|reject|commission` | R1 |
| admin | `GET /admin/rides` · `POST /admin/rides/:id/cancel` | R2 |
| admin | `GET /admin/rides/sos` · `POST /admin/rides/sos/:id/ack|close` | R5 |

## 14. ลำดับงาน + เกณฑ์ผ่าน

### R0 — Foundation
- เพิ่มคอลัมน์ `password` ใน `User` + ซ่อม `createUser`
- `POST /auth/set-password` สำหรับ user เก่า · OTP dev mode
- หน้า login/register จริง (จากดีไซน์ 06) + auth store + 401 redirect
- `SavedAddress` CRUD + หน้า profile
- ✅ สมัคร → login → `GET /auth/me` ด้วย token ได้จริง

### R1 — Driver onboarding
- `DriverProfile` + `DriverVehicle` + `DriverDocument` + admin verify/reject
- หน้า `/driver/register` (จาก 04) + `/driver/status` + `/admin/rides/drivers`
- ✅ สมัคร → อัปโหลด → admin อนุมัติ → `GET /driver/me` = VERIFIED

### R2 — เรียกใช้บริการ (ยังไม่ realtime)
- `RideTier` seed + quote + addon + สร้างงาน + บอร์ด + accept + สถานะ + เก็บเงิน + earning
- prepay mock gateway + postpay cash/transfer
- หน้า `/ride` (จาก 01), checkout (05/08), `/driver/dashboard`, `/driver/job/[id]`, `/driver/earnings`
- ✅ จบงาน 1 รอบทั้ง prepay และ postpay + earning ถูก + กันรับงานซ้อน

### R3 — Realtime tracking
- Socket.IO + `POST /driver/location` + Leaflet map + ETA + bottom sheet
- หน้า `/ride/[id]` (จาก 03)
- ✅ เปิด 2 เบราว์เซอร์ เห็นหมุดขยับภายใน 3–5 วิ

### R4 — PARCEL + rating + history
- `ParcelForm`, น้ำหนัก/ขนาด/ผู้รับ, OTP, รูปหลักฐาน, COD, rating, `/ride/history` (จาก 07)
- ✅ ส่งของจบด้วย OTP + หลักฐาน + รีวิวได้

### R5 — Chat + SOS + Ops
- Socket.IO chat (`RideMessage`) + SOS + admin console + notification
- ✅ แชทระหว่างงานได้ + กด SOS แล้ว admin เห็นภายใน 2 วิ

## 15. ความปลอดภัย / PDPA

- พิกัดเป็นข้อมูลอ่อนไหว: เก็บเฉพาะระหว่างงาน ≤ 30 วัน
- เบอร์โทรคนขับโชว์หลัง `ACCEPTED`
- `POST /driver/location` rate limit (1 ครั้ง/2 วิ/คน)
- เอกสารคนขับเก็บ private path (ไม่อยู่ใน public `/uploads`)
- ทุกการเปลี่ยนสถานะเขียน `RideStatusLog`
- chat/SOS เขียน log เก็บได้ตามกฎหมาย (ห้ามลบก่อน 90 วัน)

## 16. ความเสี่ยง / ยังไม่ตัดสิน

| เรื่อง | หมายเหตุ |
|---|---|
| `react-leaflet` + React 19 | v5 รองรับ React 19 — ยืนยันตอนติดตั้ง |
| OSRM public | จำกัด rate — production ต้อง self-host |
| Socket.IO scale | ต้องมี Redis adapter เมื่อขยายหลาย instance |
| Payment gateway | เฟสแรก mock — ต้องเลือกผู้ให้บริการจริงทีหลัง |
| `prisma db push` ใช้ไม่ได้ | apply SQL ตรงตามแพทเทิร์นเดิม |
| ธีม The Residence | ต้อง map สีเข้า `@theme` เดิม (ฟ้า #0050cb + คอรัล #ff5722) |
| LOGISTICS (เหมาคัน) | ยังไม่ทำใน R2 — รอ R4/R5 |

## 17. สถานะการพัฒนา (ล่าสุด)

- **Backend R0–R5**: ทำครบและ `npx tsc --noEmit` = 0 error — auth จริง, ใบสมัครคนขับ/เอกสาร/รถ,
  quote → create → accept → arrive → start → complete, prepay/postpay, earning, chat, SOS,
  admin console, saved address, cron หมดอายุงาน
- **Frontend**: หน้า rider `/ride`, `/ride/[id]`, `/ride/history`, `/ride/fleet`, `/profile`,
  login จริง, คนขับ `/driver/register|status|dashboard|job/[id]|earnings`,
  admin `/admin/rides`, `/admin/rides/drivers`, `/admin/rides/sos` — `npx tsc --noEmit` = 0 error
- **ทดสอบผ่านเบราว์เซอร์จริงแล้ว**: rider + driver + admin เต็มรอบ (รับงาน → แชท → SOS → จบงาน → รีวิว),
  earnings และ admin เห็นข้อมูลตรงกัน, nav ซ่อน Login เมื่อล็อกอินแล้ว
- **ยังค้าง**: รันเบราว์เซอร์ยืนยัน PARCEL + prepay QR + refund อีกรอบ (API ผ่านแล้ว),
  แผนที่ยังเป็น SVG (`RideMap`) — สลับ Leaflet ได้ภายหลัง
- **หมายเหตุ env**: front อ่าน `NEXT_PUBLIC_API_BASE_URL` (ค่าเริ่มต้น `http://localhost:4000`),
  dev DB มีข้อมูลทดสอบจาก smoke test

