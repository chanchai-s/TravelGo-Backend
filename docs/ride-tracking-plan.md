# Ride Tracking (Transport) — แผนการทำงาน Frontend / Backend

> สถานะ: **แผน (ยังไม่เริ่มเขียนโค้ด)**
> อ้างอิง: `back/docs/rental-partner-spec.md` (แพทเทิร์น partner), `back/docs/rentcars-plan.md`

## 1. ข้อตัดสินใจที่ล็อกแล้ว (2026-11-02)

| # | เรื่อง | สรุป |
|---|---|---|
| 1 | แผนที่ | **Leaflet + OpenStreetMap** (ฟรี) + OSRM คิดเส้นทาง |
| 2 | Realtime | **SSE + REST ping** (ไม่เพิ่ม dependency) มี polling fallback |
| 3 | การจ่ายเงิน | **เงินสด/โอนให้คนขับ** แล้ว platform เก็บ commission ทีหลัง |
| 4 | การจับคู่ | **คนขับกดรับงานเองจากบอร์ด** (auto-assign ทีหลัง) |
| 5 | ลำดับ | **RIDE (คน) ให้จบก่อน** แล้วต่อ PARCEL (ของ) บน engine เดิม |
| 6 | OTP สมัคร | **email/password + OTP เบอร์แบบ dev mode** (log ออกมา) ก่อน |
| 7 | บัญชีผู้ใช้ | **rider = User เดิม ไม่แยกบัญชี** · driver = User เดิม + `DriverProfile` |

## 2. หลักการ

- **บัญชีเดียว**: `User` ใช้จองที่พัก / เช่ารถ / เรียก ride / ส่งของ / สมัครเป็นคนขับ
- **คนขับคือส่วนเสริม**: `DriverProfile` (1-1 กับ User) ต้องผ่าน admin ตรวจก่อนรับงาน
- **โดเมนแยก**: ไม่ปนกับ `RentalDetail` (รถเช่า) หรือ `Booking` (ที่พัก) — ใช้ `TransportJob` ของตัวเอง
- **เงินเป็น Int (บาท)**: ไม่ใช้ทศนิยม, VAT แตก base/vat เหมือน rentcars
- **Service layer ถือ business rule**: controller ทำแค่ map HTTP ↔ service

## 3. Backend — โครงสร้างไฟล์

```
back/
├─ prisma/
│  ├─ schema.prisma           # + โมเดลใหม่ (ดู §5)
│  ├─ transport_schema.sql    # SQL apply (เพราะ prisma db push ใช้ไม่ได้)
│  ├─ transport_fk.sql        # FK + index
│  └─ seed.ts                 # + PlatformSetting ค่าโดยสาร + คนขับทดสอบ
└─ src/
   ├─ routes/
   │  ├─ transport.routes.ts      # ฝั่งลูกค้า (rider)
   │  ├─ driver.routes.ts         # ฝั่งคนขับ
   │  └─ admin.routes.ts          # (+ ตรวจคนขับ/รถ, ดูงาน)
   ├─ controllers/
   │  ├─ transport.controllers.ts
   │  ├─ driver.controllers.ts
   │  └─ transportAdmin.controllers.ts
   ├─ services/
   │  ├─ transportJob.services.ts      # lifecycle + transaction
   │  ├─ driver.services.ts            # onboarding / online / พิกัด
   │  ├─ transportFare.services.ts     # ประมาณราคา + commission
   │  └─ transportTracking.services.ts # snapshot + SSE hub
   ├─ lib/
   │  ├─ transportPricing.ts           # สูตรราคา + settings + haversine
   │  ├─ sse.ts                        # subscribe/publish/cleanup
   │  └─ geo.ts                        # ระยะทาง, bearing, validate lat/lng
   ├─ middleware/
   │  ├─ requireDriver.ts              # VERIFIED + ไม่ถูกระงับ
   │  ├─ requireRideOwner.ts           # เจ้าของงานเท่านั้น
   │  └─ rateLimit.middleware.ts       # + kind "location" | "ride"
   ├─ jobs/
   │  ├─ rideExpiry.ts                 # ไม่มีคนรับใน N นาที → EXPIRED
   │  └─ driverStale.ts                # ไม่ ping > 2 นาที → offline
   └─ server.ts                        # mount router ใหม่
```

### การไหลของ request (มาตรฐานเดียวทั้งโปรเจกต์)

```
Route → authCheck → requireDriver/Owner → Controller → Service → Prisma
                                              ↓
                                    res.json({ success, message, data })
```

- **Controller ไม่ throw ต่อ `next()`**: จับ error แล้วตอบ JSON เอง (เพราะ error middleware ของโปรเจกต์ render เป็น HTML)
- **ทุก action ที่เปลี่ยนสถานะ** ต้องอยู่ใน `prisma.$transaction` + เขียน `JobStatusLog`
- **เงิน/สถานะ** คำนวณใน service เท่านั้น ห้ามให้ client ส่งราคามา

### SSE Hub (`lib/sse.ts`)

```ts
const channels = new Map<string, Set<Response>>(); // key = jobId หรือ driverId
export function subscribe(key: string, res: Response)
export function publish(key: string, event: string, payload: unknown)
export function closeAll(key: string)
```

- heartbeat ทุก 25 วิ (กัน proxy ตัด connection)
- ลบ client ออกจาก set เมื่อ `req.on("close")`
- **ข้อจำกัด**: `EventSource` ตั้ง header ไม่ได้ → ใช้ **ticket**:
  `POST /transport/jobs/:id/ticket` → `{ ticket }` (JWT อายุ 60 วิ, ผูก jobId)
  แล้ว `GET /transport/jobs/:id/stream?ticket=...`

## 4. Frontend — โครงสร้างไฟล์

```
front/src/
├─ app/
│  ├─ Api/mainApi.ts                  # + ฟังก์ชัน ride/driver (~20 ตัว)
│  ├─ stores/transport.stores.ts      # zustand: currentJob, driverPos, streamState
│  ├─ components/transport/
│  │  ├─ MapView.tsx                  # Leaflet (dynamic import + ssr:false)
│  │  ├─ LocationPicker.tsx           # เลือกจุดรับ/ส่ง (pin + ค้นหา)
│  │  ├─ VehicleTypePicker.tsx        # มอไซค์/รถยนต์/van/กระบะ/ truck
│  │  ├─ FareEstimate.tsx             # ประมาณราคา + ระยะทาง + ETA
│  │  ├─ JobStatusTimeline.tsx        # สถานะทีละขั้น
│  │  ├─ DriverCard.tsx               # ชื่อ/ทะเบียน/rating/ปุ่มโทร
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
│     └─ admin/transport/page.tsx     # ตรวจคนขับ/รถ + งานที่มีปัญหา
```

### รูปแบบ state

| ข้อมูล | เก็บที่ | เหตุผล |
|---|---|---|
| job ปัจจุบัน + สถานะ | `transport.stores.ts` (zustand) | หลายหน้าจอใช้ร่วม |
| พิกัดคนขับล่าสุด | store (อัปเดตจาก SSE) | re-render เฉพาะแผนที่/ETA |
| ตำแหน่งของฉัน | local state | ไม่ต้องแชร์ |
| token | `localStorage.travel_token` (เดิม) | ใช้ร่วมกับทุกฟีเจอร์ |

### Leaflet ใน Next 16

```tsx
const MapView = dynamic(() => import("@/components/transport/MapView"), {
  ssr: false,               // Leaflet แตะ window ตอน import
  loading: () => <MapSkeleton />,
});
```
- ใช้ `react-leaflet` (ต้องเช็กว่าเวอร์ชันรองรับ React 19) — ถ้าไม่รองรับ ใช้ `leaflet` ตรง ๆ ผ่าน `useEffect`
- ต้อง import CSS ของ leaflet ใน component (client only)

## 5. Data model (ร่าง)

```prisma
enum TransportServiceType { RIDE PARCEL }
enum TransportStatus {
  REQUESTED SEARCHING ACCEPTED ARRIVING ARRIVED
  IN_PROGRESS COMPLETED CANCELLED EXPIRED
}
enum DriverStatus { PENDING VERIFIED REJECTED SUSPENDED }
enum DriverVehicleType { MOTORCYCLE CAR VAN PICKUP TRUCK }
enum TransportPayment { CASH TRANSFER }

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
  commissionRate  Int?     // ถ้า null ใช้ค่ากลางจาก PlatformSetting
  verifiedAt      DateTime?
  rejectedReason  String?
}

// --- ใหม่ ---
DriverVehicle   id, driverId, type, brand, model, plateNo, color, seats,
                maxWeightKg, photoUrl, isActive, createdAt
DriverDocument  id, driverId, type(LICENSE|VEHICLE_REG|ID_CARD|CRIMINAL_CHECK|INSURANCE),
                url, status, reviewNote, reviewedAt
SavedAddress    id, userId, label, address, lat, lng, isDefault
TransportJob    id, ref, riderId, driverId?, serviceType, status,
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
JobStatusLog    id, jobId, fromStatus, toStatus, byUserId, note, createdAt
DriverLocation  id, driverId, jobId?, lat, lng, bearing?, speed?, recordedAt
JobPayment      id, jobId, type(FARE|TIP|REFUND), method, amount, baseAmount, vatAmount, paidAt
DriverEarning   id, jobId(unique), driverId, gross, commissionRate, commission, net,
                status(PENDING|PAID), paidAt, createdAt
JobRating       id, jobId(unique), riderId, driverId, stars, text, createdAt
```

**Index ที่จำเป็น**: `TransportJob[status, requestedAt]`, `TransportJob[driverId, status]`,
`TransportJob[riderId, requestedAt]`, `DriverLocation[jobId, recordedAt]`, `DriverProfile[isOnline, lastLocationAt]`

## 6. State machine + กติกา

```
REQUESTED ──(มีคนขับในระบบ)──> SEARCHING ──accept──> ACCEPTED ──ถึงจุดรับ──> ARRIVING → ARRIVED
   └─ ไม่มีคนรับ/ครบ N นาที → EXPIRED        ARRIVED ──เริ่มเดินทาง──> IN_PROGRESS
                                                                          ↓
                                             COMPLETED ←── ถึงปลายทาง (PARCEL: + deliveryOtp/รูป)
ACCEPTED/ARRIVING/ARRIVED ──ยกเลิก──> CANCELLED (มี cancelBy: RIDER | DRIVER | ADMIN | SYSTEM)
```

| กติกา | รายละเอียด |
|---|---|
| ใครยกเลิกได้เมื่อไหร่ | rider ยกเลิกได้ก่อน `IN_PROGRESS`; driver ยกเลิกได้ก่อน `ARRIVED` (ต้องมีเหตุผล) |
| ค่าธรรมเนียมยกเลิก | หลัง `ACCEPTED` → หักจาก rider (MVP: แค่บันทึก ไม่ตัดเงินจริง) |
| คนขับรับงานซ้อน | ห้าม — ต้องไม่มีงาน active อยู่ก่อน (`status` ∈ ACCEPTED..IN_PROGRESS) |
| OTP | `PARCEL` ต้องยืนยัน `deliveryOtp` ก่อน `COMPLETED`; `RIDE` ใช้ได้แต่ไม่บังคับ |
| Tracking ที่ใครเห็น | rider เห็นพิกัดคนขับเฉพาะ `ACCEPTED..IN_PROGRESS`; คนอื่นไม่เห็น |
| เก็บพิกัด | `DriverLocation` เก็บเฉพาะระหว่างมีงาน, ลบ/เก็บ ≤ 30 วัน |

## 7. สูตรค่าโดยสาร

```
fare      = max(minFare, baseFare + distanceKm × perKm + durationMin × perMin)
PARCEL   += sizeFee (S/M/L) + weightFee (ส่วนที่เกิน 5 กก.)
commission = round(fare × commissionRate / 100)
netToDriver = fare − commission
```

- ค่าทั้งหมดอยู่ใน `PlatformSetting`: `ride_base_fare`, `ride_per_km`, `ride_per_min`, `ride_min_fare`,
  `parcel_fee_s|m|l`, `parcel_per_kg_over`, `driver_commission_rate`
- `fareEstimate` = ตอนเรียก, `fareFinal` = ตอนจบงาน (ปลายทางจริงอาจเปลี่ยน)
- **Client ห้ามส่งราคามา** — server คำนวณจาก lat/lng + setting เท่านั้น

## 8. API ที่จะเพิ่ม

| ฝั่ง | Endpoint | เฟส |
|---|---|---|
| auth | ซ่อม `POST /auth/register` ให้เก็บ password · `POST /auth/otp/request` · `POST /auth/otp/verify` | R0 |
| rider | `GET/POST/DELETE /saved-addresses` | R0 |
| rider | `POST /transport/quote` (จุดรับ-ส่ง + ประเภทรถ → ราคา) | R2 |
| rider | `POST /transport/jobs` · `GET /transport/jobs/:id` · `GET /transport/jobs` | R2 |
| rider | `POST /transport/jobs/:id/cancel` · `POST /transport/jobs/:id/rate` | R2/R4 |
| rider | `POST /transport/jobs/:id/ticket` · `GET /transport/jobs/:id/stream` (SSE) | R3 |
| driver | `POST /driver/apply` · `GET /driver/me` · `POST /driver/documents` · `POST /driver/vehicles` | R1 |
| driver | `PATCH /driver/status` (online/offline) · `POST /driver/location` | R3 |
| driver | `GET /driver/jobs/available` · `POST /driver/jobs/:id/accept\|arrive\|start\|complete` | R2 |
| driver | `POST /driver/jobs/:id/collect-payment` · `GET /driver/earnings` | R2/R4 |
| admin | `GET /admin/drivers` · `POST /admin/drivers/:id/verify\|reject\|commission` | R1 |
| admin | `GET /admin/transport/jobs` · `POST /admin/transport/jobs/:id/cancel` | R5 |

## 9. ลำดับงาน + เกณฑ์ผ่าน

### R0 — Foundation (bắt đầu từนี่)
- ซ่อม `createUser` ให้เก็บ `password` (เพิ่มคอลัมน์ + migration SQL)
- หน้า `/login` เรียก `POST /auth/register|login` จริง (เดิมเป็น `setTimeout`)
- OTP dev mode: `POST /auth/otp/request` log รหัส 6 หลัก
- `SavedAddress` CRUD + หน้าจอในโปรไฟล์
- ✅ ผ่านเมื่อ: สมัคร → login → เรียก `GET /auth/me` ด้วย token ได้จริง

### R1 — Driver onboarding
- `DriverProfile` + เอกสาร + รถ + admin verify/reject
- ✅ ผ่านเมื่อ: สมัครคนขับ → อัปโหลด → admin อนุมัติ → `GET /driver/me` = VERIFIED

### R2 — เรียกใช้บริการ (ยังไม่ tracking)
- quote → สร้างงาน → บอร์ดงาน → accept → สถานะ → เก็บเงิน → earning
- ✅ ผ่านเมื่อ: จบงาน 1 รอบได้ + `DriverEarning` ถูกต้อง + กันรับงานซ้อน

### R3 — Realtime tracking
- `POST /driver/location` + SSE + แผนที่ 2 หน้า + ETA
- ✅ ผ่านเมื่อ: เปิด 2 เบราว์เซอร์แล้วเห็นหมุดขยับภายใน 3-5 วิ

### R4 — PARCEL + rating + earnings
- ✅ ผ่านเมื่อ: ส่งของจบด้วย OTP + หลักฐาน + รีวิวได้

### R5 — Ops/ความปลอดภัย
- admin dashboard, ระงับคนขับ, SOS/แชร์ทริป, notification

## 10. ความปลอดภัย / PDPA

- พิกัดเป็นข้อมูลอ่อนไหว: เก็บเฉพาะระหว่างงาน, ไม่เปิดให้คนอื่นเห็น, ลบภายใน 30 วัน
- เบอร์โทรคนขับโชว์หลัง `ACCEPTED` เท่านั้น
- `POST /driver/location` ต้อง rate limit แยก (เช่น 1 ครั้ง/2 วิ/คน)
- เอกสารคนขับเก็บแบบ private path (ไม่อยู่ใน public `/uploads`)
- ทุกการเปลี่ยนสถานะเขียน `JobStatusLog` (ใคร/เมื่อไหร่)

## 11. ความเสี่ยง / เรื่องที่ยังไม่ตัดสิน

| เรื่อง | หมายเหตุ |
|---|---|
| `react-leaflet` + React 19 | ต้องเช็ก compat ก่อน ถ้าไม่ผ่านใช้ `leaflet` ตรง ๆ |
| OSRM public server | จำกัด rate — production ต้อง self-host หรือใช้ผู้ให้บริการ |
| SSE + proxy/CDN | ต้องปิด buffering (`X-Accel-Buffering: no`) |
| OTP dev mode | ห้ามหลุดขึ้น production (เช็ก `NODE_ENV`) |
| `prisma db push` ใช้ไม่ได้ | ต้อง apply SQL ตรงตามแพทเทิร์นเดิม |
| Commision คนขับ | ยังไม่ตัดสินว่า per-driver หรือค่ากลาง (แผนใช้ per-driver + fallback) |
