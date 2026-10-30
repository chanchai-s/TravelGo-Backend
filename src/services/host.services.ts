import prisma from "../lib/prismaClient";
import { commissionRate, ownerEarningsSummary } from "./earning.services";

async function findVerifiedHost(userId: string) {
  if (!userId) {
    return null;
  }
  const host = await prisma.hostProfile.findFirst({ where: { userId } });
  if (!host || host.status !== 'VERIFIED') {
    return null;
  }
  return host;
}

async function assertOwner(propertyId: string, userId: string) {
  const property = await prisma.stay.findUnique({
    where: { id: propertyId },
    include: { host: true },
  });
  if (!property) {
    throw new Error('Property not found');
  }
  if (!property.host || property.host.userId !== userId) {
    throw new Error('Not your property');
  }
  return property;
}

export async function upsertProperty(propertyId: string, data: any, userId: string) {
  const { currentStep, propertyType, bookingType, wholeProperty, uniqueDetail, photos, roomTypes, amenities, policy, nearby, status, draftKey, ...stepData } = data;
  const isSubmit = status === 'PENDING_REVIEW';
  const host = await findVerifiedHost(userId);

  // ต้อง login + เป็น host ที่ยืนยันแล้วเท่านั้นตอนกดส่งตรวจสอบ
  if (isSubmit && !host) {
    throw new Error('Login required');
  }

  if (!propertyId || propertyId === 'new') {
    const stay = await prisma.stay.create({
      data: {
        hostId: host?.id ?? null,
        // ยังไม่มีเจ้าของ = ต้องมีกุญแจกันคนอื่นมาแก้
        draftKey: host ? null : makeDraftKey(),
        propertyType: propertyType || 'HOTEL',
        currentStep: currentStep || 1,
        status: 'DRAFT',
        name: stepData.name || 'ที่พักไม่มีชื่อ',
        location: stepData.location || '',
        pricePerNight: stepData.pricePerNight || 0,
        ...stepData,
      },
    });
    await saveTypeDetails(stay.id, wholeProperty, uniqueDetail);
    await saveStepDetails(stay.id, photos, roomTypes, amenities, policy, nearby);

    // ส่งเข้าคิวทันที (ไม่ปกติ แต่กันไว้) — ต้องผ่านเงื่อนไขขั้นต่ำ
    if (isSubmit) {
      await prisma.stay.update({ where: { id: stay.id }, data: { status: 'PENDING' } });
      await checkReadyToSubmit(stay.id, stay.propertyType);
      await checkDuplicate(stay.id, stay.name, stay.location);
    }
    return stay;
  }

  const existing = await assertCanEdit(propertyId, userId, draftKey);
  const isUnclaimed = !existing.hostId;

  // ก่อนส่งเข้าคิว ต้องผ่านเงื่อนไขขั้นต่ำ + ไม่ซ้ำกับประกาศเดิม
  if (isSubmit) {
    await checkReadyToSubmit(propertyId, existing.propertyType);
    await checkDuplicate(propertyId, String(stepData.name ?? existing.name), String(stepData.location ?? existing.location));
  }

  const stay = await prisma.stay.update({
    where: { id: propertyId },
    data: {
      // ผูกเจ้าของให้ร่างที่ยังไม่มีเจ้าของเมื่อผู้ใช้ login แล้ว (ผ่านการตรวจ draftKey แล้ว)
      ...(isUnclaimed && host ? { hostId: host.id, draftKey: null } : {}),
      currentStep: currentStep,
      ...(isSubmit ? { status: 'PENDING' } : {}),
      ...stepData,
    },
  });
  await saveTypeDetails(stay.id, wholeProperty, uniqueDetail);
  await saveStepDetails(stay.id, photos, roomTypes, amenities, policy, nearby);
  return stay;
}

// ราคาที่แสดงในลิสต์/รายละเอียด = ห้องที่ถูกที่สุดของที่พักนั้น (ตรงกับตอนจอง)
// ถ้าไม่มีห้องให้ใช้ราคาที่กรอกไว้ในขั้นตอนแรก
async function syncStayPriceFromRooms(stayId: string) {
  const rooms = await prisma.roomType.findMany({
    where: { stayId },
    select: { basePrice: true },
  });
  if (rooms.length === 0) {
    return;
  }
  const lowest = Math.min(...rooms.map((room) => room.basePrice));
  await prisma.stay.update({ where: { id: stayId }, data: { pricePerNight: lowest } });
}

async function saveStepDetails(stayId: string, photos: any, roomTypes: any, amenities: any, policy: any, nearby: any) {
  if (Array.isArray(photos)) {
    await prisma.stayPhoto.deleteMany({ where: { stayId } });
    const rows = photos
      .filter((photo: any) => photo && photo.url)
      .map((photo: any, index: number) => ({
        stayId,
        url: String(photo.url),
        caption: photo.caption || null,
        isCover: index === 0,
      }));
    if (rows.length > 0) {
      await prisma.stayPhoto.createMany({ data: rows });
    }
  }
  if (Array.isArray(roomTypes)) {
    const existing = await prisma.roomType.findMany({ where: { stayId }, select: { id: true } });
    const ids = existing.map((room) => room.id);
    if (ids.length > 0) {
      await prisma.roomInventory.deleteMany({ where: { roomTypeId: { in: ids } } });
      await prisma.roomBed.deleteMany({ where: { roomTypeId: { in: ids } } });
      await prisma.roomType.deleteMany({ where: { id: { in: ids } } });
    }
    for (const room of roomTypes) {
      if (!room || !room.name) {
        continue;
      }
      const created = await prisma.roomType.create({
        data: {
          stayId,
          name: String(room.name),
          roomSizeSqM: Number(room.roomSizeSqM) || null,
          maxGuests: Number(room.maxGuests) || 2,
          basePrice: Number(room.basePrice) || 0,
          totalRooms: Number(room.totalRooms) || 1,
        },
      });
      const beds = Array.isArray(room.beds) ? room.beds : [];
      for (const bed of beds) {
        if (!bed || !bed.bedType) {
          continue;
        }
        await prisma.roomBed.create({
          data: {
            roomTypeId: created.id,
            type: String(bed.bedType),
            count: Number(bed.quantity) || 1,
          },
        });
      }
    }
  }
  if (amenities && typeof amenities === 'object') {
    await prisma.stayAmenity.upsert({
      where: { stayId },
      create: {
        stayId,
        generalAmenities: amenities.generalAmenities || [],
        roomAmenities: amenities.roomAmenities || [],
        diningServices: amenities.diningServices || [],
        petFriendly: amenities.petFriendly === true,
      },
      update: {
        generalAmenities: amenities.generalAmenities || [],
        roomAmenities: amenities.roomAmenities || [],
        diningServices: amenities.diningServices || [],
        petFriendly: amenities.petFriendly === true,
      },
    });
  }
  if (policy && typeof policy === 'object') {
    await prisma.stayPolicy.upsert({
      where: { stayId },
      create: {
        stayId,
        checkIn: policy.checkIn || null,
        checkOut: policy.checkOut || null,
        cancellation: policy.cancellation || null,
        childrenAllowed: policy.childrenAllowed !== false,
        petsAllowed: policy.petsAllowed === true,
        deposit: policy.deposit ? Number(policy.deposit) : null,
        paymentMethods: policy.paymentMethods || null,
        minAge: policy.minAge ? Number(policy.minAge) : null,
      },
      update: {
        checkIn: policy.checkIn || null,
        checkOut: policy.checkOut || null,
        cancellation: policy.cancellation || null,
        childrenAllowed: policy.childrenAllowed !== false,
        petsAllowed: policy.petsAllowed === true,
        deposit: policy.deposit ? Number(policy.deposit) : null,
        paymentMethods: policy.paymentMethods || null,
        minAge: policy.minAge ? Number(policy.minAge) : null,
      },
    });
  }
  if (Array.isArray(nearby)) {
    await prisma.stayNearby.deleteMany({ where: { stayId } });
    const rows = nearby
      .filter((place: any) => place && place.label)
      .map((place: any) => ({
        stayId,
        label: String(place.label),
        category: ["transport", "shopping", "landmark", "dining"].includes(place.category)
          ? String(place.category)
          : "landmark",
        distance: String(place.distance || ""),
      }));
    if (rows.length > 0) {
      await prisma.stayNearby.createMany({ data: rows });
    }
  }

  // ราคาที่โชว์ต้องตรงกับห้องที่ถูกสุดเสมอ
  if (Array.isArray(roomTypes)) {
    await syncStayPriceFromRooms(stayId);
  }
}

/**
 * ตรวจสิทธิ์แก้ไขประกาศ
 * - มีเจ้าของแล้ว → ต้องเป็นเจ้าของเท่านั้น
 * - ยังไม่มีเจ้าของ (ร่างไร้คน) → ต้องมี draftKey ที่ตรงกับที่สร้างไว้
 */
async function assertCanEdit(propertyId: string, userId: string, draftKey?: string) {
  const property = await prisma.stay.findUnique({
    where: { id: propertyId },
    include: { host: true },
  });
  if (!property) {
    throw new Error('Property not found');
  }

  if (property.hostId) {
    if (property.host?.userId !== userId) {
      throw new Error('Not your property');
    }
    return property;
  }

  if (!draftKey || draftKey !== property.draftKey) {
    throw new Error('Invalid draft key');
  }
  return property;
}

// สร้างกุญแจสุ่มสำหรับร่างไร้เจ้าของ
function makeDraftKey(): string {
  return `dk_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function saveTypeDetails(stayId: string, wholeProperty: any, uniqueDetail: any) {
  if (wholeProperty && typeof wholeProperty === 'object') {
    await prisma.wholePropertyDetail.upsert({
      where: { stayId },
      create: { stayId, ...wholeProperty },
      update: { ...wholeProperty },
    });
  }
  if (uniqueDetail && typeof uniqueDetail === 'object') {
    await prisma.uniquePropertyDetail.upsert({
      where: { stayId },
      create: { stayId, ...uniqueDetail },
      update: { ...uniqueDetail },
    });
  }
}

/**
 * ดึงข้อมูลที่พักตาม ID พร้อมความสัมพันธ์เชิงลึก
 */
export async function getPropertyByIdService(propertyId: string, userId: string, draftKey?: string) {
  const property = await prisma.stay.findUnique({
    where: { id: propertyId },
    include: {
      host: true,
      photos: true,
      amenities: true,
      policy: true,
      nearby: true,
      roomTypes: {
        include: { beds: true, inventories: true }
      },
      wholeProperty: true,
      uniqueDetail: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // ร่างที่ยังไม่มีเจ้าของ ต้องมี draftKey ที่ตรงกัน (ป้องกันคนอื่นแอบดู/แก้)
  if (!property.hostId) {
    if (!draftKey || draftKey !== property.draftKey) {
      throw new Error('Invalid draft key');
    }
    return property;
  }

  if (property.host?.userId !== userId) {
    throw new Error('Not your property');
  }

  return property;
}

/**
 * ฟิลด์สำคัญ = แก้แล้วต้องส่งเข้าคิวตรวจใหม่ (ชื่อ / ราคา / รูป / ประเภทห้อง)
 * ฟิลด์อื่น (สิ่งอำนวย คำอธิบาย นโยบาย รายการใกล้เคียง) แก้แล้วขึ้นเว็บทันที
 */
const CRITICAL_FIELDS = ['name', 'pricePerNight'] as const;

async function findCriticalChanges(
  stayId: string,
  data: any,
  photos: any,
  roomTypes: any,
): Promise<string[]> {
  const current = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { photos: { select: { url: true } }, roomTypes: { select: { name: true, basePrice: true } } },
  });
  if (!current) {
    return [];
  }

  const changed: string[] = [];

  for (const field of CRITICAL_FIELDS) {
    if (data[field] === undefined) {
      continue;
    }
    if (String(data[field]) !== String(current[field] ?? '')) {
      changed.push(field);
    }
  }

  if (Array.isArray(photos)) {
    const before = current.photos.map((item) => item.url).sort().join('|');
    const after = photos.filter((item: any) => item?.url).map((item: any) => String(item.url)).sort().join('|');
    if (before !== after) {
      changed.push('photos');
    }
  }

  if (Array.isArray(roomTypes)) {
    const before = JSON.stringify(
      current.roomTypes.map((room) => [room.name, room.basePrice]).sort(),
    );
    const after = JSON.stringify(
      roomTypes
        .filter((room: any) => room?.name)
        .map((room: any) => [String(room.name), Number(room.basePrice ?? 0)])
        .sort(),
    );
    if (before !== after) {
      changed.push('roomTypes');
    }
  }

  return changed;
}

/**
 * อัปเดตข้อมูลประกาศ (แก้ไข) — รองรับทั้งข้อมูลหลักและตารางย่อย (รูป/ห้อง/สิ่งอำนวย/นโยบาย/nearby)
 * ถ้าเป็นประกาศที่ขึ้นเว็บอยู่แล้วและแก้ฟิลด์สำคัญ = ต้องกลับเข้าคิวตรวจใหม่
 */
export async function patchPropertyService(propertyId: string, data: any, userId: string) {
  const { wholeProperty, uniqueDetail, photos, roomTypes, amenities, policy, nearby, status, draftKey, ...stepData } = data;
  await assertCanEdit(propertyId, userId, draftKey);

  const existing = await prisma.stay.findUnique({ where: { id: propertyId }, select: { status: true } });
  const isLive = existing?.status === 'PUBLISHED';

  const criticalChanges = isLive
    ? await findCriticalChanges(propertyId, stepData, photos, roomTypes)
    : [];
  const mustReReview = isLive && criticalChanges.length > 0;

  const stay = await prisma.stay.update({
    where: { id: propertyId },
    data: {
      ...stepData,
      ...(status === 'PENDING'
        ? { status: 'PENDING', rejectedReason: null }
        : mustReReview
          ? { status: 'PENDING', rejectedReason: null }
          : {}),
    },
  });

  await saveTypeDetails(propertyId, wholeProperty, uniqueDetail);
  await saveStepDetails(propertyId, photos, roomTypes, amenities, policy, nearby);

  if (mustReReview) {
    await prisma.moderationLog.create({
      data: {
        adminId: userId,
        targetType: 'STAY',
        targetId: propertyId,
        action: 'RESUBMIT',
        reason: `แก้ไขฟิลด์สำคัญ: ${criticalChanges.join(', ')}`,
      },
    });
  }

  return {
    stay,
    mustReReview,
    changedFields: criticalChanges,
  };
}

/**
 * ลบประกาศที่พัก (หรือเปลี่ยนสถานะเป็น DELETED ตามความเหมาะสม)
 */
export async function deletePropertyService(propertyId: string, userId: string) {
  await assertOwner(propertyId, userId);

  return await prisma.stay.delete({
    where: { id: propertyId },
  });
}

// ---------- ตรวจความครบก่อนส่งเข้าคิว ----------

// ตัดอักขระพิเศษและช่องว่างออก เพื่อเทียบชื่อ/ที่อยู่ที่ "เหมือนกัน"
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "");
}

// ประเภทที่ต้องมีห้องพักอย่างน้อย 1 ห้อง
const NEEDS_ROOM = ["HOTEL", "GUEST_HOUSE", "RESORT", "HOSTEL", "CONDO", "APARTMENT"];

/**
 * เงื่อนไขขั้นต่ำก่อนกดส่ง: มีรูป ≥1, มีห้อง ≥1 (ตามประเภท), ราคา > 0
 * คืนข้อความ error ถ้าไม่ครบ ถ้าครบคืน null
 */
async function checkReadyToSubmit(stayId: string, propertyType: string) {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { photos: { select: { id: true } }, roomTypes: { select: { id: true } } },
  });

  if (!stay) {
    throw new Error('Property not found');
  }
  if (stay.photos.length < 1) {
    throw new Error('กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป');
  }
  if (NEEDS_ROOM.includes(propertyType) && stay.roomTypes.length < 1) {
    throw new Error('กรุณาเพิ่มประเภทห้องอย่างน้อย 1 ห้อง');
  }
  if (stay.pricePerNight <= 0) {
    throw new Error('กรุณากรอกราคาต่อคืนให้มากกว่า 0');
  }
}

/**
 * กันประกาศซ้ำ: ชื่อ+ทำเลต้องไม่ตรงกับประกาศอื่นที่ยังอยู่ในระบบ
 */
async function checkDuplicate(stayId: string, name: string, location: string) {
  if (name === '' || location === '') {
    return;
  }

  const targetName = normalizeText(name);
  const targetLocation = normalizeText(location);

  const others = await prisma.stay.findMany({
    where: { id: { not: stayId } },
    select: { name: true, location: true },
  });

  const duplicated = others.some(
    (item) =>
      normalizeText(item.name) === targetName &&
      normalizeText(item.location) === targetLocation,
  );

  if (duplicated) {
    throw new Error('มีประกาศชื่อและทำเลนี้อยู่แล้ว กรุณาตรวจสอบหรือแก้ชื่อที่พัก');
  }
}

// ---------- ปิดขาย / เปิดขายรายวัน (stop sell) ----------

/**
 * เจ้าของกำหนดวันที่ปิดขายของแต่ละประเภทห้อง
 * รูปแบบ: [{ roomTypeId, dates: ["2026-11-01", ...] }]
 */
export async function setStopSellService(propertyId: string, userId: string, payload: any) {
  const entries = Array.isArray(payload?.items) ? payload.items : [];

  await assertOwner(propertyId, userId);

  const rooms = await prisma.roomType.findMany({
    where: { stayId: propertyId },
    select: { id: true },
  });
  const allowed = new Set(rooms.map((room) => room.id));

  let saved = 0;
  for (const entry of entries) {
    const roomTypeId = String(entry?.roomTypeId ?? '');
    const dates = Array.isArray(entry?.dates) ? entry.dates : [];
    if (!allowed.has(roomTypeId)) {
      continue;
    }
    for (const value of dates) {
      const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      await prisma.roomInventory.upsert({
        where: { roomTypeId_date: { roomTypeId, date } },
        create: { roomTypeId, stayId: propertyId, date, totalRooms: 0, booked: 0 },
        update: { totalRooms: 0 },
      });
      saved += 1;
    }
  }

  return { saved };
}

/** คืนสถานะปิดขายทั้งหมดของประกาศ (ใช้แสดงในหน้าจัดการ) */
export async function listStopSellService(propertyId: string, userId: string) {
  await assertOwner(propertyId, userId);

  const rows = await prisma.roomInventory.findMany({
    where: { totalRooms: 0 },
    orderBy: { date: "asc" },
    select: { roomTypeId: true, date: true },
  });

  const roomIds = await prisma.roomType.findMany({
    where: { stayId: propertyId },
    select: { id: true },
  });
  const allowed = new Set(roomIds.map((room) => room.id));

  return rows
    .filter((row) => allowed.has(row.roomTypeId))
    .map((row) => ({
      roomTypeId: row.roomTypeId,
      date: row.date.toISOString().slice(0, 10),
    }));
}

// ---------- แดชบอร์ดเจ้าของ ----------

/**
 * สรุปภาพรวมของเจ้าของ: ประกาศ / การจอง / ยอดขาย
 * ยอดขายมาจาก OwnerEarning (ที่หักคอมมิชชันตอนจองแล้ว) ไม่คำนวณซ้ำ
 */
export async function hostDashboardService(userId: string) {
  const host = await prisma.hostProfile.findUnique({ where: { userId } });
  if (!host) {
    return {
      listings: { total: 0, published: 0, pending: 0, rejected: 0, draft: 0 },
      bookings: { total: 0, active: 0, upcoming: 0, completed: 0, cancelled: 0 },
      revenue: { gross: 0, commissionRate: commissionRate(), commission: 0, net: 0 },
      recentBookings: [],
    };
  }

  const stays = await prisma.stay.findMany({
    where: { hostId: host.id },
    select: { id: true, name: true, status: true },
  });
  const stayIds = stays.map((item) => item.id);

  const bookings = await prisma.booking.findMany({
    where: { stayId: { in: stayIds }, type: 'STAY' },
    orderBy: { createdAt: 'desc' },
    include: { stay: { select: { name: true } } },
  });

  const active = bookings.filter((item) => item.status !== 'CANCELLED');
  const money = await ownerEarningsSummary(host.id);

  const now = Date.now();
  const upcoming = active.filter(
    (item) => item.status === 'UPCOMING' && item.checkOut !== null && item.checkOut.getTime() > now,
  ).length;
  const completed = active.filter(
    (item) => item.status === 'COMPLETED' || (item.checkOut !== null && item.checkOut.getTime() <= now),
  ).length;

  return {
    listings: {
      total: stays.length,
      published: stays.filter((item) => item.status === 'PUBLISHED').length,
      pending: stays.filter((item) => item.status === 'PENDING').length,
      rejected: stays.filter((item) => item.status === 'REJECTED').length,
      draft: stays.filter((item) => item.status === 'DRAFT').length,
    },
    bookings: {
      total: bookings.length,
      active: active.length,
      upcoming,
      completed,
      cancelled: bookings.filter((item) => item.status === 'CANCELLED').length,
    },
    revenue: {
      gross: money.gross,
      commissionRate: commissionRate(),
      commission: money.commission,
      net: money.net,
    },
    recentBookings: bookings.slice(0, 10).map((item) => ({
      id: item.id,
      ref: item.ref,
      status: item.status,
      totalPrice: item.totalPrice,
      travelDate: item.travelDate,
      stayName: item.stay?.name ?? '',
      createdAt: item.createdAt,
    })),
  };
}

/**
 * ประกาศทั้งหมดของเจ้าของ (หน้า "ประกาศของฉัน") เรียงใหม่สุดก่อน
 */
export async function listMyStaysService(userId: string) {
  return await prisma.stay.findMany({
    where: { host: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      propertyType: true,
      status: true,
      currentStep: true,
      location: true,
      pricePerNight: true,
      updatedAt: true,
      rejectedReason: true,
      photos: { select: { url: true }, take: 1 },
    },
  });
}

/**
 * สมัคร/แก้ไขข้อมูล Partner — สร้าง HostProfile สถานะ PENDING รอแอดมินตรวจ
 */
export async function applyAsHostService(userId: string, data: any) {
  const accountType = data.accountType === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL';

  // ครั้งแรกสร้างใหม่ ครั้งถัดไปแก้ของเดิม (สถานะคงเดิม ไม่ถูกรีเซ็ต)
  const host = await prisma.hostProfile.upsert({
    where: { userId },
    create: {
      userId,
      status: 'PENDING',
      displayName: data.displayName || null,
      accountType,
      taxId: data.taxId || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
    },
    update: {
      displayName: data.displayName || null,
      accountType,
      taxId: data.taxId || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      rejectedReason: null,
    },
  });

  return host;
}

/**
 * เพิ่มเอกสารยืนยันตัวตน (อัปโหลดไฟล์มาแล้วค่อยเรียก)
 */
export async function addVerificationDocumentService(userId: string, docType: string, fileUrl: string) {
  const host = await prisma.hostProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!host) {
    throw new Error('ยังไม่ได้สมัครเป็นเจ้าของที่พัก');
  }

  return await prisma.verificationDocument.create({
    data: { hostId: host.id, type: docType, url: fileUrl, status: 'PENDING' },
  });
}

/**
 * ดูสถานะ Partner ของตัวเอง (PENDING / VERIFIED / REJECTED + เอกสาร)
 */
export async function getHostProfileService(userId: string) {
  const host = await prisma.hostProfile.findUnique({ where: { userId } });

  if (!host) {
    return null;
  }

  const documents = await prisma.verificationDocument.findMany({
    where: { hostId: host.id },
    orderBy: { createdAt: 'desc' },
  });

  return {
    id: host.id,
    status: host.status,
    displayName: host.displayName,
    accountType: host.accountType,
    taxId: host.taxId,
    contactName: host.contactName,
    contactPhone: host.contactPhone,
    verifiedAt: host.verifiedAt,
    rejectedReason: host.rejectedReason,
    documents,
  };
}