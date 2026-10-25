import prisma from "../lib/prismaClient";
import { availabilityForStay, nightsBetween } from "../lib/availability";
import { createEarningForBooking, voidEarningForBooking } from "./earning.services";

// ---------- การจอง ----------

// เลขอ้างอิงสั้นๆ คนอ่านง่าย เช่น WG-8KQ4M2
function makeRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += chars[Math.floor(Math.random() * chars.length)];
  }
  return `WG-${tail}`;
}

// สถานะที่แสดง: ถ้าวันออกพักผ่านไปแล้วถือว่าเสร็จสิ้น (ยังไม่ต้องมี job)
function effectiveStatus(status: string, checkOut: Date | null): string {
  if (status === "UPCOMING" && checkOut && checkOut.getTime() < Date.now()) {
    return "COMPLETED";
  }
  return status;
}

function parseDates(checkIn: string, checkOut: string) {
  const from = new Date(checkIn);
  const to = new Date(checkOut);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("วันที่ไม่ถูกต้อง");
  }
  if (to.getTime() <= from.getTime()) {
    throw new Error("วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน");
  }
  return { from, to };
}

/**
 * สร้างการจองของที่พัก — เช็คห้องว่างก่อนเสมอ
 * ราคา = ราคาห้อง × จำนวนคืน (ยังไม่มีค่าธรรมเนียม/ส่วนแบ่ง)
 */
export async function createStayBookingService(userId: string, data: any) {
  const stayId = String(data.stayId ?? "");
  const roomTypeId = String(data.roomTypeId ?? "");
  const rooms = Math.max(1, Math.min(9, Number(data.rooms) || 1));
  const guests = Math.max(1, Math.min(20, Number(data.guests) || 1));
  const { from: checkIn, to: checkOut } = parseDates(
    String(data.checkIn ?? ""),
    String(data.checkOut ?? ""),
  );

  if (stayId === "" || roomTypeId === "") {
    throw new Error("ข้อมูลไม่ครบ");
  }

  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { roomTypes: true },
  });
  if (!stay || stay.status !== "PUBLISHED") {
    throw new Error("ที่พักไม่พร้อมให้จอง");
  }

  const room = stay.roomTypes.find((item) => item.id === roomTypeId);
  if (!room) {
    throw new Error("ไม่พบประเภทห้อง");
  }

  if (guests > rooms * room.maxGuests) {
    throw new Error(`จำนวนผู้เข้าพักไม่เกิน ${rooms * room.maxGuests} คนได้`);
  }

  // เช็คห้องว่างของประเภทห้องนี้ในช่วงวันที่เลือก
  const rows = await availabilityForStay(stayId, checkIn, checkOut);
  const target = rows.find((row) => row.roomTypeId === roomTypeId);
  if (!target || target.available < rooms) {
    throw new Error(
      target !== undefined && target.available > 0
        ? `ห้องเหลือแค่ ${target.available} ห้องในช่วงวันที่เลือก`
        : "ห้องเต็มแล้วในช่วงวันที่เลือก (อาจถูกปิดขายไว้)",
    );
  }

  let totalPrice = room.basePrice * rooms * nightsBetween(checkIn, checkOut);
  let voucherId: string | null = null;
  let discountAmount = 0;
  const voucherCode = data.voucherCode ? String(data.voucherCode) : "";
  if (voucherCode) {
    const v = await prisma.voucher.findUnique({ where: { code: voucherCode } });
    if (v && (!v.expiresAt || v.expiresAt >= new Date()) && (v.usageLimit === 0 || v.usedCount < v.usageLimit)) {
      if (v.minSpend === 0 || totalPrice >= v.minSpend) {
        if (v.scope === "ALL" || (v.scope === "STAY" && v.stayId === stayId)) {
          discountAmount = v.type === "PERCENT" ? Math.round((totalPrice * v.value) / 100) : v.value;
          if (v.maxDiscount) discountAmount = Math.min(discountAmount, v.maxDiscount);
          discountAmount = Math.min(discountAmount, totalPrice);
          totalPrice = totalPrice - discountAmount;
          voucherId = v.id;
          await prisma.voucher.update({ where: { id: v.id }, data: { usedCount: { increment: 1 } } });
        }
      }
    }
  }

  const booking = await prisma.booking.create({
    data: {
      ref: makeRef(),
      userId,
      type: "STAY",
      status: "UPCOMING",
      totalPrice,
      voucherId,
      discountAmount,
      travelDate: checkIn,
      checkIn,
      checkOut,
      stayId,
      roomTypeId,
      rooms,
      guests,
    },
  });

  // หักค่าคอมมิชชันทันที (ยอดขาย - คอมมิชชัน = สุทธิที่เจ้าของได้)
  await createEarningForBooking(booking.id, stayId, totalPrice);

  return booking;
}

/** จองที่พัก + ตั๋วเครื่องบิน พร้อมกัน (Package) */
export async function createPackageBookingService(userId: string, data: any) {
  const stayId = String(data.stayId ?? "");
  const flightId = String(data.flightId ?? "");
  const roomTypeId = String(data.roomTypeId ?? "");
  const rooms = Math.max(1, Math.min(9, Number(data.rooms) || 1));
  const guests = Math.max(1, Math.min(20, Number(data.guests) || 1));
  const flightPersons = Math.max(1, Math.min(20, Number(data.flightPersons) || data.guests || 1));
  const { from: checkIn, to: checkOut } = parseDates(
    String(data.checkIn ?? ""),
    String(data.checkOut ?? ""),
  );

  if (stayId === "" || roomTypeId === "" || flightId === "") {
    throw new Error("ข้อมูลไม่ครบ");
  }

  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { roomTypes: true },
  });
  if (!stay || stay.status !== "PUBLISHED") {
    throw new Error("ที่พักไม่พร้อมให้จอง");
  }

  const room = stay.roomTypes.find((item) => item.id === roomTypeId);
  if (!room) {
    throw new Error("ไม่พบประเภทห้อง");
  }

  if (guests > rooms * room.maxGuests) {
    throw new Error(`จำนวนผู้เข้าพักไม่เกิน ${rooms * room.maxGuests} คนได้`);
  }

  // เช็คห้องว่าง
  const stayRows = await availabilityForStay(stayId, checkIn, checkOut);
  const stayTarget = stayRows.find((row) => row.roomTypeId === roomTypeId);
  if (!stayTarget || stayTarget.available < rooms) {
    throw new Error(
      stayTarget !== undefined && stayTarget.available > 0
        ? `ห้องเหลือแค่ ${stayTarget.available} ห้องในช่วงวันที่เลือก`
        : "ห้องเต็มแล้วในช่วงวันที่เลือก (อาจถูกปิดขายไว้)",
    );
  }

  // เช็คเที่ยวบิน
  const flight = await prisma.flight.findUnique({ where: { id: flightId } });
  if (!flight || flight.status !== "PUBLISHED") {
    throw new Error("เที่ยวบินไม่พร้อมให้จอง");
  }
  if (flight.seats < flightPersons) {
    throw new Error(`ที่นั่งเหลือไม่พอ (เหลือ ${flight.seats} ที่นั่ง)`);
  }

  // คำนวณราคา
  const stayPrice = room.basePrice * rooms * nightsBetween(checkIn, checkOut);
  const flightPrice = flight.price * flightPersons;
  let totalPrice = stayPrice + flightPrice;

  // Voucher (ถ้ามี)
  let voucherId: string | null = null;
  let discountAmount = 0;
  const voucherCode = data.voucherCode ? String(data.voucherCode) : "";
  if (voucherCode) {
    const v = await prisma.voucher.findUnique({ where: { code: voucherCode } });
    if (v && (!v.expiresAt || v.expiresAt >= new Date()) && (v.usageLimit === 0 || v.usedCount < v.usageLimit)) {
      if (v.minSpend === 0 || totalPrice >= v.minSpend) {
        if (v.scope === "ALL" || (v.scope === "STAY" && v.stayId === stayId)) {
          discountAmount = v.type === "PERCENT" ? Math.round((totalPrice * v.value) / 100) : v.value;
          if (v.maxDiscount) discountAmount = Math.min(discountAmount, v.maxDiscount);
          discountAmount = Math.min(discountAmount, totalPrice);
          totalPrice = totalPrice - discountAmount;
          voucherId = v.id;
          await prisma.voucher.update({ where: { id: v.id }, data: { usedCount: { increment: 1 } } });
        }
      }
    }
  }

  // สร้าง Booking แบบ Package (type = PACKAGE, มี stayId และ flightId)
  const booking = await prisma.booking.create({
    data: {
      ref: makeRef(),
      userId,
      type: "PACKAGE",
      status: "UPCOMING",
      totalPrice,
      voucherId,
      discountAmount,
      travelDate: checkIn,
      checkIn,
      checkOut,
      stayId,
      roomTypeId,
      flightId,
      rooms,
      guests,
    },
  });

  // หักที่นั่งเที่ยวบิน
  await prisma.flight.update({ where: { id: flightId }, data: { seats: { decrement: flightPersons } } });

  // หักค่าคอมมิชชันจากยอดรวม
  await createEarningForBooking(booking.id, stayId, totalPrice);

  // อัปเดต seats ของเที่ยวบินใน booking (เก็บจำนวนผู้โดยสารใน flightPersons)
  // สามารถเก็บใน booking ด้วย field เพิ่มเติม หรือสร้างตารางแยก
  // ตอนนี้เก็บใน booking โดยใช้ field guests สำหรับผู้เข้าพัก และ flightPersons ต้องเพิ่ม field
  // สำหรับตอนนี้ใช้ totalPrice และ flightId แค่ reference

  return booking;
}

/** ยกเลิกการจอง (ห้องคืนอัตโนมัติ เพราะห้องว่างคิดจากรายการจองสด) */
export async function cancelBookingService(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.userId !== userId) {
    throw new Error("Not your booking");
  }
  if (booking.status === "COMPLETED") {
    throw new Error("การจองนี้เสร็จสิ้นแล้ว ยกเลิกไม่ได้");
  }
  if (booking.status === "CANCELLED") {
    throw new Error("การจองนี้ถูกยกเลิกไปแล้ว");
  }

  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  // รายได้/คอมมิชชันของการจองนี้ต้องถูกยกเลิกตาม (ยังเก็บประวัติไว้)
  await voidEarningForBooking(bookingId);

  return await prisma.booking.findUnique({ where: { id: bookingId } });
}

/** เปลี่ยนวันเข้าออก — เช็คห้องว่างของช่วงใหม่ก่อนบันทึก */
export async function changeBookingDatesService(
  bookingId: string,
  userId: string,
  checkInValue: string,
  checkOutValue: string,
) {
  const { from: checkIn, to: checkOut } = parseDates(checkInValue, checkOutValue);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.userId !== userId) {
    throw new Error("Not your booking");
  }
  if (booking.status === "CANCELLED") {
    throw new Error("การจองนี้ถูกยกเลิกแปลว");
  }
  if (!booking.stayId || !booking.roomTypeId) {
    throw new Error("การจองนี้เปลี่ยนวันไม่ได้");
  }

  const rows = await availabilityForStay(booking.stayId, checkIn, checkOut);
  const target = rows.find((row) => row.roomTypeId === booking.roomTypeId);
  if (!target || target.available < 1) {
    throw new Error("ห้องไม่ว่างในช่วงวันที่ใหม่");
  }

  const stay = await prisma.stay.findUnique({
    where: { id: booking.stayId },
    include: { roomTypes: true },
  });
  const room = stay?.roomTypes.find((item) => item.id === booking.roomTypeId);

  return await prisma.booking.update({
    where: { id: bookingId },
    data: {
      checkIn,
      checkOut,
      travelDate: checkIn,
      totalPrice: (room?.basePrice ?? booking.totalPrice) * nightsBetween(checkIn, checkOut),
    },
  });
}

// การจองของฉัน (ล่าสุดก่อน) พร้อมรีวิวที่เขียนไว้แล้ว
export async function listMyBookingsService(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      stay: {
        select: {
          id: true,
          name: true,
          location: true,
          addressLine: true,
          photos: { select: { url: true }, take: 1 },
        },
      },
    },
  });

  const reviews = await prisma.review.findMany({
    where: { bookingId: { in: bookings.map((item) => item.id) } },
    select: { id: true, bookingId: true, rating: true, text: true },
  });
  const reviewByBooking = new Map(reviews.map((item) => [item.bookingId, item]));

  return bookings.map((booking) => ({
    id: booking.id,
    ref: booking.ref,
    type: booking.type,
    status: effectiveStatus(booking.status, booking.checkOut),
    totalPrice: booking.totalPrice,
    travelDate: booking.travelDate,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    createdAt: booking.createdAt,
    stay: booking.stay,
    review: reviewByBooking.get(booking.id) ?? null,
  }));
}

// ใช้ตอนเขียนรีวิว — ต้องมีการจองที่ "เสร็จสิ้น" ของที่พักนั้นจริง
export async function findCompletedBooking(stayId: string, userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId, stayId, type: "STAY", status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
  });

  return (
    bookings.find((booking) => effectiveStatus(booking.status, booking.checkOut) === "COMPLETED") ?? null
  );
}

// รีวิวของที่พัก + ค่าเฉลี่ย
export async function listStayReviewsService(stayId: string) {
  const reviews = await prisma.review.findMany({
    where: { stayId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  const total = reviews.length;
  const average = total === 0 ? 0 : reviews.reduce((sum, item) => sum + item.rating, 0) / total;

  return {
    average,
    total,
    buckets: [5, 4, 3, 2, 1].map((score) => ({
      score,
      count: reviews.filter((item) => item.rating === score).length,
    })),
    items: reviews.map((item) => ({
      id: item.id,
      rating: item.rating,
      text: item.text,
      author: item.user.name,
      createdAt: item.createdAt,
    })),
  };
}

// เขียนรีวิว (1 การจอง = 1 รีวิว) แล้วคำนวณคะแนนรวมกลับไปที่ที่พัก
export async function createReviewService(userId: string, stayId: string, rating: number, text: string) {
  const booking = await findCompletedBooking(stayId, userId);
  if (!booking) {
    throw new Error("เขียนรีวิวได้เฉพาะการจองที่เข้าพักแล้วเท่านั้น");
  }

  const score = Math.min(5, Math.max(1, Math.round(rating)));
  if (!Number.isFinite(score)) {
    throw new Error("ให้คะแนน 1-5 ดาว");
  }

  let review;
  try {
    review = await prisma.review.create({
      data: { userId, stayId, bookingId: booking.id, rating: score, text: text.trim() === "" ? null : text.trim() },
    });
  } catch (error: any) {
    // การจอง 1 ครั้ง รีวิวได้ 1 ครั้ง (unique bookingId)
    if (String(error.message).includes("bookingId")) {
      throw new Error("คุณเขียนรีวิวการจองนี้แล้ว");
    }
    throw error;
  }

  const all = await prisma.review.findMany({ where: { stayId }, select: { rating: true } });
  const average = all.reduce((sum, item) => sum + item.rating, 0) / all.length;

  await prisma.stay.update({
    where: { id: stayId },
    data: { rating: Number(average.toFixed(2)), reviewCount: all.length },
  });

  return review;
}