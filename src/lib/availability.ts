import prisma from "./prismaClient";

/**
 * ความจริงหลักของห้องว่าง = totalRooms − จองที่ทับช่วงวันที่ (นับตามจำนวนห้องที่จอง)
 * ไม่นับ/ลดตัวเลขสะสม จึงไม่มีวันเพี้ยน
 * วันที่ที่เจ้าของกด "ปิดขาย" (stop sell) จะถือว่าไม่รับจองเลย
 */

const DAY = 24 * 60 * 60 * 1000;

// จำนวนคืนระหว่างสองวัน (อย่างน้อย 1)
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / DAY));
}

// รายการวันที่ (ช่วงคืน) ที่กรอก — เช็คอินรวม วันออกพักไม่รวม
export function eachNight(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  for (let time = checkIn.getTime(); time < checkOut.getTime(); time += DAY) {
    nights.push(new Date(time));
  }
  return nights;
}

// แปลงวันเป็น YYYY-MM-DD ในเขตเวลาไทย (ตรงกับที่เก็บใน RoomInventory)
export function toDateKey(date: Date): string {
  const iso = new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return iso.slice(0, 10);
}

/** วันที่ที่เจ้าของปิดขายของประเภทห้องนี้ */
async function closedDates(roomTypeId: string, checkIn: Date, checkOut: Date): Promise<Set<string>> {
  const nights = eachNight(checkIn, checkOut);
  const first: Date | undefined = nights[0];
  const last: Date | undefined = nights[nights.length - 1];
  if (!first || !last) {
    return new Set();
  }

  const rows = await prisma.roomInventory.findMany({
    where: {
      roomTypeId,
      totalRooms: 0,
      date: { gte: first, lte: last },
    },
    select: { date: true },
  });

  return new Set(rows.map((row) => toDateKey(row.date)));
}

/**
 * ห้องว่างของแต่ละประเภทห้องในช่วงวันที่
 * available = totalRooms − (จองของประเภทนั้น) และ = 0 ทันทีถ้ามีวันที่ปิดขาย
 */
export async function availabilityForStay(stayId: string, checkIn: Date, checkOut: Date) {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { roomTypes: true },
  });

  if (!stay) {
    return [];
  }

  const bookings = await prisma.booking.findMany({
    where: {
      stayId,
      type: "STAY",
      status: { not: "CANCELLED" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomTypeId: true, rooms: true },
  });

  const results = [];
  for (const room of stay.roomTypes) {
    const booked = bookings
      .filter((item) => item.roomTypeId === room.id)
      .reduce((sum, item) => sum + (item.rooms ?? 1), 0);

    const closed = await closedDates(room.id, checkIn, checkOut);

    results.push({
      roomTypeId: room.id,
      name: room.name,
      totalRooms: room.totalRooms,
      maxGuests: room.maxGuests,
      basePrice: room.basePrice,
      available: closed.size > 0 ? 0 : Math.max(0, room.totalRooms - booked),
      closedDates: [...closed],
    });
  }

  return results;
}

/** ยังมีห้องว่างตามจำนวนที่ขอไหม (ใช้กันจองเกิน) */
export async function hasAvailability(
  stayId: string,
  checkIn: Date,
  checkOut: Date,
  rooms = 1,
): Promise<boolean> {
  const rows = await availabilityForStay(stayId, checkIn, checkOut);
  return rows.some((row) => row.available >= rooms);
}

/**
 * ปฏิทินห้องว่างล่วงหน้า (ใช้แสดงแถบ 14 วัน)
 * คืนต่อวัน: ว่างกี่ห้อง / ปิดขายไหม
 */
export async function availabilityCalendar(stayId: string, days: number, roomTypeId?: string) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * DAY);

  const rows = await availabilityForStay(stayId, from, to);

  const list = roomTypeId ? rows.filter((row) => row.roomTypeId === roomTypeId) : rows;

  // วันที่ปิดขายของแต่ละประเภทห้อง
  const closedByRoom = new Map<string, Set<string>>();
  for (const row of list) {
    closedByRoom.set(row.roomTypeId, new Set(row.closedDates));
  }

  const days_ = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from.getTime() + i * DAY);
    const key = toDateKey(date);

    // จองที่ทับคืนนี้
    const bookings = await prisma.booking.findMany({
      where: {
        stayId,
        type: "STAY",
        status: { not: "CANCELLED" },
        checkIn: { lte: date },
        checkOut: { gt: date },
      },
      select: { roomTypeId: true, rooms: true },
    });

    days_.push({
      date: key,
      rooms: list.map((row) => {
        const booked = bookings
          .filter((item) => item.roomTypeId === row.roomTypeId)
          .reduce((sum, item) => sum + (item.rooms ?? 1), 0);
        const closed = closedByRoom.get(row.roomTypeId)?.has(key) ?? false;
        return {
          roomTypeId: row.roomTypeId,
          name: row.name,
          totalRooms: row.totalRooms,
          booked,
          available: closed ? 0 : Math.max(0, row.totalRooms - booked),
          isClosed: closed,
        };
      }),
    });
  }

  return { from: toDateKey(from), days: days_, items: list };
}