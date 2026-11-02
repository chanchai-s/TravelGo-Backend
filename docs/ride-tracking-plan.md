# Ride (เรียกรถ / ส่งของ) — แผนการทำงาน Frontend / Backend

> สถานะ: **แผน (ยังไม่เริ่มเขียนโค้ด)**
> โดเมนนี้ **แยกจาก `transport` โดยสิ้นเชิง** (คนละส่วน คนละ route คนละตาราง)
> อ้างอิงแพทเทิร์นเดิม: `rentalBooking.services.ts`, `partnerVehicle.services.ts`

## 1. ข้อตัดสินใจที่ล็อกแล้ว

| # | เรื่อง | สรุป |
|---|---|---|
| 1 | ชื่อโดเมน | **`ride`** (ไม่ใช้ `transport`) |
| 2 | แผนที่ | **Leaflet + OpenStreetMap** (ฟรี) + OSRM คิดเส้นทาง |
| 3 | Realtime | **SSE + REST ping** (ไม่เพิ่ม dependency) |
| 4 | การจ่ายเงิน | **เงินสด/โอนให้คนขับ** แล้ว platform เก็บ commission ทีหลัง |
| 5 | การจับคู่ | **คนขับกดรับงานเองจากบอร์ด** (auto-assign ทีหลัง) |
| 6 | ลำดับ | **RIDE (คน) ให้จบก่อน** แล้วต่อ PARCEL (ของ) บน engine เดิม |
| 7 | OTP สมัคร | **email/password + OTP เบอร์แบบ dev mode** ก่อน |
| 8 | บัญชีผู้ใช้ | **rider = User เดิม ไม่แยกบัญชี** · driver = User เดิม + `DriverProfile` |

## 2. หลักการ

- **บัญชีเดียว**: `User` ใช้จองที่พัก / เช่ารถ / เรียกรถ / ส่งของ / สมัครเป็นคนขับ
- **คนขับคือส่วนเสริม**: `DriverProfile` (1-1 กับ User) ต้องผ่าน admin ตรวจก่อนรับงาน
- **โดเมนแยก**: ไม่ปนกับ `Transport` (รถไฟ), `RentalDetail` (รถเช่า) หรือ `Booking` (ที่พัก)
- **เงินเป็น Int (บาท)**: ไม่ใช้ทศนิยม, VAT แตก base/vat เหมือน rentcars
- **Service ถือ business rule**: controller ทำแค่ map HTTP ↔ service

## 3. แนวทางการเขียนโค้ด (ให้เหมือนของเดิมในโปรเจกต์)

เขียนแบบเดียวกับ `rentalBooking.services.ts` / `partnerVehicle.services.ts`:

- ฟังก์ชัน `export async function xxxService(...)` ธรรมดา — **ไม่ใช้ class / repository / DI**
- คอมเมนต์ภาษาไทยสั้น ๆ เฉพาะจุดที่ต้องอธิบาย "ทำไม"
- helper เล็ก ๆ ไว้บนไฟล์: `text()`, `optionalText()`, `optionalInt()`, `parseDate()` แบบเดิม
- error = `throw new Error("ข้อความภาษาไทย")` แล้ว controller แปลงเป็น status code ด้วย regex
  (แบบ `NOT_FOUND` / `FORBIDDEN` ใน `rentalBooking.controllers.ts`)
- controller ตอบ JSON ตรง: `res.json({ success, message, data })` — ไม่ส่งต่อ `next()`
- เปลี่ยนหลายตารางพร้อมกัน → `prisma.$transaction(async (tx) => ...)`
- **ไม่ต้องมี middleware `requireRideOwner`** — เช็กเจ้าของใน service แบบ `ownedRental()` ที่มีอยู่แล้ว
- middleware ที่ต้องมีจริง ๆ มีตัวเดียว: `driverCheck` (แบบ `authCheck` / `requireVehiclePartner`) — ใช้ `import` ปกติ

## 4. Backend — โครงสร้างไฟล์

```
back/
├─ prisma/
│  ├─ schema.prisma           # + โมเดลใหม่ (ดู §6)
│  ├─ ride_schema.sql         # SQL apply (เพราะ prisma db push ใช้ไม่ได้)
│  └─ seed.ts                 # + PlatformSetting ค่าโดยสาร + คนขับทดสอบ
└─ src/
   ├─ routes/
   │  ├─ ride.routes.ts         # ฝั่งลูกค้า: /rides/...
   │  ├─ rideDriver.routes.ts   # ฝั่งคนขับ: /driver/...
   │  └─ admin.routes.ts        # + /admin/rides, /admin/drivers
   ├─ controllers/
   │  ├─ ride.controllers.ts
   │  ├─ rideDriver.controllers.ts
   │  └─ rideAdmin.controllers.ts
   ├─ services/
   │  ├─ rideJob.services.ts      # lifecycle + transaction
   │  ├─ rideDriver.services.ts   # onboarding / online / พิกัด
   │  ├─ rideFare.services.ts     # ประมาณราคา + commission
   │  └─ rideTracking.services.ts # snapshot + SSE
   ├─ lib/
   │  ├─ ridePricing.ts           # สูตรราคา + haversine + settings
   │  └─ sse.ts                   # subscribe/publish/cleanup
   ├─ middleware/
   │  └─ rideDriver.middleware.ts # driverCheck (VERIFIED + ไม่ถูกระงับ)
   ├─ jobs/
   │  ├─ rideExpiry.ts            # ไม่มีคนรับใน N นาที → EXPIRED
   │  └─ driverStale.ts           # ไม่ ping > 2 นาที → offline
   └─ server.ts                   # mount router ใหม่
```

### การไหลของ request

```
Route → authCheck → driverCheck → Controller → Service → Prisma
                                        ↓
                              res.json({ success, message, data })
```

### SSE Hub (`lib/sse.ts`)

```ts
const channels = new Map<string, Set<Response>>(); // key = rideJobId
export function subscribe(key: string, res: Response)
export function publish(key: string, event: string, payload: unknown)
export function closeAll(key: string)
```

- heartbeat ทุก 25 วิ (กัน proxy ตัด connection)
- ลบ client ออกจาก set เมื่อ `req.on("close")`
- **`EventSource` ตั้ง header ไม่ได้** → ใช้ ticket:
  `POST /rides/jobs/:id/ticket` → `{ ticket }` (JWT อายุ 60 วิ ผูก jobId)
  แล้ว `GET /rides/jobs/:id/stream?ticket=...`

## 5. Frontend — โครงสร้างไฟล์

```
front/src/
├─ app/
│  ├─ Api/mainApi.ts                  # + ฟังก์ชัน ride (~20 ตัว)
│  ├─ stores/ride.stores.ts           # zustand: currentJob, driverPos
│  ├─ components/ride/
│  │  ├─ MapView.tsx                  # Leaflet (dynamic import + ssr:false)
│  │  ├─ LocationPicker.tsx
│  │  ├─ VehicleTypePicker.tsx
│  │  ├─ FareEstimate.tsx
│  │  ├─ RideStatusTimeline.tsx
│  │  ├─ DriverCard.tsx
│  │  └─ OtpBox.tsx                   # OTP ส่งมอบ (PARCEL)
│  └─ [locale]/
│     ├─ login/page.tsx               # แก้ให้เรียก API จริง (R0)
│     ├─ ride/
│     │  ├─ page.tsx                  # เลือกจุด + ประเภทรถ + ดูราคา + เรียก
│     │  └─ [id]/page.tsx             # ติดตามงาน (แผนที่สด + สถานะ)
│     ├─ driver/
│     │  ├─ register/page.tsx         # สมัคร + เอกสาร + รถ
│     │  ├─ dashboard/page.tsx        # online/offline + บอร์ดงาน
│     │  ├─ job/[id]/page.tsx         # รับงาน → นำทาง → สถานะ → เก็บเงิน
│     │  └─ earnings/page.tsx
│     └─ admin/rides/page.tsx         # ตรวจคนขับ/รถ + งานที่มีปัญหา
```

### รูปแบบ state

| ข้อมูล | เก็บที่ |
|---|---|
| งานปัจจุบัน + สถานะ | `ride.stores.ts` (zustand) |
| พิกัดคนขับล่าสุด | store (อัปเดตจาก SSE) |
| พิกัดของฉัน | local state |

### Leaflet ใน Next 16

```tsx
const MapView = dynamic(() => import("@/components/ride/MapView"), {
  ssr: false,               // Leaflet แตะ window ตอน import
  loading: () => <MapSkeleton />,
});
```

## 6. Data model (ร่าง)

```prisma
enum RideServiceType { RIDE PARCEL }
enum RideStatus {
  REQUESTED SEARCHING ACCEPTED ARRIVING ARRIVED
  IN_PROGRESS COMPLETED CANCELLED EXPIRED
}
enum DriverStatus { PENDING VERIFIED REJECTED SUSPENDED }
enum DriverVehicleType { MOTORCYCLE CAR VAN PICKUP TRUCK }
enum RidePaymentMethod { CASH TRANSFER }

// --- ขยายของเดิม ---
DriverProfile {
  ...ของเดิม
  serviceTypes    Json?     // ["RIDE","PARCEL"]
  vehicleType     DriverVehicleType?
  status          DriverStatus @default(PENDING)
  isOnline        Boolean  @default(false)
  lastLat         Float?
  lastLng         Float?
  lastLocationAt  DateTime?
  rating          Float    @default(5)
  totalTrips      Int      @default(0)
  commissionRate  Int?     // null = ใช้ค่ากลางจาก PlatformSetting
  verifiedAt      DateTime?
  rejectedReason  String?
}

// --- ใหม่ ---
DriverVehicle   id, driverId, type, brand, model, plateNo, color, seats,
                maxWeightKg, photoUrl, isActive, createdAt
DriverDocument  id, driverId, type(LICENSE|VEHICLE_REG|ID_CARD|CRIMINAL_CHECK|INSURANCE),
                url, status, reviewNote, reviewedAt
SavedAddress    id, userId, label, address, lat, lng, isDefault
RideJob         id, ref, riderId, driverId?, serviceType, status,
                pickupLat, pickupLng, pickupAddress,
                dropoffLat, dropoffLng, dropoffAddress,
                vehicleType, distanceKm, durationMin,
                fareEstimate, fareFinal, commissionRate, commission, netToDriver,
                paymentMethod, paymentStatus,
                requestedAt, acceptedAt, arrivedAt, startedAt, completedAt, cancelledAt,
                cancelReason, cancelBy
ParcelDetail    jobId(1-1), weightKg, sizeTier, isFragile,
                receiverName, receiverPhone, pickupOtp, deliveryOtp,
                proofPhotoUrl, signatureUrl
RideStatusLog   id, jobId, fromStatus, toStatus, byUserId, note, createdAt
DriverLocation  id, driverId, jobId?, lat, lng, bearing?, speed?, recordedAt
RidePayment     id, jobId, type(FARE|TIP|REFUND), method, amount, baseAmount, vatAmount, paidAt
DriverEarning   id, jobId(unique), driverId, gross, commissionRate, commission, net,
                status(PENDING|PAID), paidAt, createdAt
RideRating      id, jobId(unique), riderId, driverId, stars, text, createdAt
```

**Index**: `RideJob[status, requestedAt]`, `RideJob[driverId, status]`, `RideJob[riderId, requestedAt]`,
`DriverLocation[jobId, recordedAt]`, `DriverProfile[isOnline, lastLocationAt]`

**ไม่แตะ**: `BookingType.TRANSPORT` (ใช้อยู่กับการเช่ารถ) และตาราง/หน้า `transport` เดิม

## 7. State machine + กติกา

```
REQUESTED ──(มีคนขับในระบบ)──> SEARCHING ──accept──> ACCEPTED ──ถึงจุดรับ──> ARRIVING → ARRIVED
   └─ ไม่มีคนรับ/ครบ N นาที → EXPIRED        ARRIVED ──เริ่มเดินทาง──> IN_PROGRESS
                                                                          ↓
                                             COMPLETED ←── ถึงปลายทาง (PARCEL: + deliveryOtp/รูป)
ACCEPTED/ARRIVING/ARRIVED ──ยกเลิก──> CANCELLED (cancelBy: RIDER | DRIVER | ADMIN | SYSTEM)
```

| กติกา | รายละเอียด |
|---|---|
| ใครยกเลิกได้เมื่อไหร่ | rider ยกเลิกได้ก่อน `IN_PROGRESS`; driver ยกเลิกได้ก่อน `ARRIVED` (ต้องมีเหตุผล) |
| คนขับรับงานซ้อน | ห้าม — ต้องไม่มีงาน active อยู่ก่อน (`ACCEPTED..IN_PROGRESS`) |
| OTP | `PARCEL` ต้องยืนยัน `deliveryOtp` ก่อน `COMPLETED`; `RIDE` ไม่บังคับ |
| Tracking ที่ใครเห็น | rider เห็นพิกัดคนขับเฉพาะ `ACCEPTED..IN_PROGRESS` |
| เก็บพิกัด | เก็บเฉพาะระหว่างมีงาน ≤ 30 วัน |

## 8. สูตรค่าโดยสาร

```
fare = max(minFare, baseFare + distanceKm × perKm + durationMin × perMin)
PARCEL += sizeFee (S/M/L) + weightFee (ส่วนที่เกิน 5 กก.)
commission = round(fare × commissionRate / 100)
netToDriver = fare − commission
```

- ค่าอยู่ใน `PlatformSetting`: `ride_base_fare`, `ride_per_km`, `ride_per_min`, `ride_min_fare`,
  `parcel_fee_s|m|l`, `parcel_per_kg_over`, `driver_commission_rate`
- **client ห้ามส่งราคามา** — server คิดจาก lat/lng + setting

## 9. API ที่จะเพิ่ม

| ฝั่ง | Endpoint | เฟส |
|---|---|---|
| auth | ซ่อม `POST /auth/register` (เก็บ password) · `POST /auth/otp/request` · `POST /auth/otp/verify` | R0 |
| rider | `GET/POST/DELETE /saved-addresses` | R0 |
| rider | `POST /rides/quote` | R2 |
| rider | `POST /rides/jobs` · `GET /rides/jobs/:id` · `GET /rides/jobs` | R2 |
| rider | `POST /rides/jobs/:id/cancel` · `POST /rides/jobs/:id/rate` | R2/R4 |
| rider | `POST /rides/jobs/:id/ticket` · `GET /rides/jobs/:id/stream` (SSE) | R3 |
| driver | `POST /driver/apply` · `GET /driver/me` · `POST /driver/documents` · `POST /driver/vehicles` | R1 |
| driver | `PATCH /driver/status` · `POST /driver/location` | R3 |
| driver | `GET /driver/jobs/available` · `POST /driver/jobs/:id/accept\|arrive\|start\|complete` | R2 |
| driver | `POST /driver/jobs/:id/collect-payment` · `GET /driver/earnings` | R2/R4 |
| admin | `GET /admin/drivers` · `POST /admin/drivers/:id/verify\|reject\|commission` | R1 |
| admin | `GET /admin/rides` · `POST /admin/rides/:id/cancel` | R5 |

## 10. ลำดับงาน + เกณฑ์ผ่าน

### R0 — Foundation
- ซ่อม `createUser` ให้เก็บ `password` (เพิ่มคอลัมน์ + SQL)
- หน้า `/login` เรียก `POST /auth/register|login` จริง (เดิมเป็น `setTimeout`)
- OTP dev mode: `POST /auth/otp/request` log รหัส 6 หลัก
- `SavedAddress` CRUD
- ✅ ผ่านเมื่อ: สมัคร → login → `GET /auth/me` ได้จริง

### R1 — Driver onboarding
- `DriverProfile` + เอกสาร + รถ + admin verify/reject
- ✅ ผ่านเมื่อ: สมัคร → อัปโหลด → admin อนุมัติ → `GET /driver/me` = VERIFIED

### R2 — เรียกใช้บริการ (ยังไม่ tracking)
- quote → สร้างงาน → บอร์ดงาน → accept → สถานะ → เก็บเงิน → earning
- ✅ ผ่านเมื่อ: จบงาน 1 รอบ + `DriverEarning` ถูก + กันรับงานซ้อน

### R3 — Realtime tracking
- `POST /driver/location` + SSE + แผนที่ 2 หน้า + ETA
- ✅ ผ่านเมื่อ: เปิด 2 เบราว์เซอร์ เห็นหมุดขยับภายใน 3-5 วิ

### R4 — PARCEL + rating + earnings
- ✅ ผ่านเมื่อ: ส่งของจบด้วย OTP + หลักฐาน + รีวิวได้

### R5 — Ops/ความปลอดภัย
- admin dashboard, ระงับคนขับ, SOS/แชร์ทริป, notification

## 11. ความปลอดภัย / PDPA

- พิกัดเป็นข้อมูลอ่อนไหว: เก็บเฉพาะระหว่างงาน, ลบภายใน 30 วัน
- เบอร์โทรคนขับโชว์หลัง `ACCEPTED` เท่านั้น
- `POST /driver/location` rate limit แยก (เช่น 1 ครั้ง/2 วิ/คน)
- เอกสารคนขับเก็บ private path (ไม่อยู่ใน public `/uploads`)
- ทุกการเปลี่ยนสถานะเขียน `RideStatusLog`

## 12. ความเสี่ยง / ยังไม่ตัดสิน

| เรื่อง | หมายเหตุ |
|---|---|
| `react-leaflet` + React 19 | เช็ก compat ก่อน ถ้าไม่ผ่านใช้ `leaflet` ตรง ๆ |
| OSRM public server | จำกัด rate — production ต้อง self-host |
| SSE + proxy/CDN | ต้องปิด buffering (`X-Accel-Buffering: no`) |
| OTP dev mode | ห้ามหลุด production (เช็ก `NODE_ENV`) |
| `prisma db push` ใช้ไม่ได้ | apply SQL ตรงตามแพทเทิร์นเดิม |
| Commission คนขับ | per-driver + fallback ค่ากลาง |
| หน้า `/transport` เดิม | ยังเป็น mock อยู่ — ไม่แตะในงานนี้ |
