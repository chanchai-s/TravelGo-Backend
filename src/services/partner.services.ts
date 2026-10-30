import prisma from "../lib/prismaClient";

/**
 * ข้อตกลงพาร์ทเนอร์รถเช่า — เวอร์ชันปัจจุบัน
 * เก็บ snapshot ไว้ที่ VehiclePartner.contractVersion ตอนกดยอมรับ
 */
export const PARTNER_CONTRACT_VERSION = "v1";

export const PARTNER_DOCUMENT_TYPES = [
  "COMPANY_CERT",
  "VAT_CERT",
  "BOOK_BANK",
  "ID_CARD",
  "OTHER",
] as const;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

// ---------- ฝั่งพาร์ทเนอร์ (บริษัทรถเช่า) ----------

/**
 * สมัคร/แก้ไขข้อมูลบริษัทรถเช่า — นิติบุคคลเท่านั้น
 * ครั้งแรกสร้างใหม่ (PENDING) · ถูกตีกลับแล้วส่งใหม่ได้ · ยืนยันแล้วแก้ได้แค่ข้อมูลติดต่อ
 */
export async function applyAsVehiclePartnerService(userId: string, data: any) {
  const companyName = text(data.companyName);
  const taxId = text(data.taxId);
  const companyRegNo = text(data.companyRegNo) || null;
  const vatRegistered = data.vatRegistered === true;
  const address = text(data.address);
  const contactName = text(data.contactName);
  const contactPhone = text(data.contactPhone);
  const contactEmail = text(data.contactEmail) || null;

  if (companyName === "") throw new Error("ต้องระบุชื่อบริษัท");
  if (taxId === "") throw new Error("ต้องระบุเลขประจำตัวผู้เสียภาษี");
  if (address === "") throw new Error("ต้องระบุที่อยู่บริษัท");
  if (contactName === "") throw new Error("ต้องระบุชื่อผู้ติดต่อ");
  if (contactPhone === "") throw new Error("ต้องระบุเบอร์โทรผู้ติดต่อ");

  const existing = await prisma.vehiclePartner.findUnique({ where: { userId } });

  const profile = {
    companyName,
    taxId,
    companyRegNo,
    vatRegistered,
    address,
    contactName,
    contactPhone,
    contactEmail,
  };

  // ยืนยันแล้ว = แก้ข้อมูลติดต่อได้ แต่ไม่รีเซ็ตสถานะ/ค่าคอม
  if (existing?.status === "VERIFIED") {
    return await prisma.vehiclePartner.update({ where: { userId }, data: profile });
  }

  return await prisma.vehiclePartner.upsert({
    where: { userId },
    create: { userId, status: "PENDING", ...profile },
    update: { status: "PENDING", rejectedReason: null, ...profile },
  });
}

/** ดูสถานะพาร์ทเนอร์ของตัวเอง + เอกสาร + สาขา */
export async function getMyVehiclePartnerService(userId: string) {
  const partner = await prisma.vehiclePartner.findUnique({
    where: { userId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      branches: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { vehicles: true } },
    },
  });

  if (!partner) {
    return null;
  }

  return {
    id: partner.id,
    status: partner.status,
    companyName: partner.companyName,
    taxId: partner.taxId,
    companyRegNo: partner.companyRegNo,
    vatRegistered: partner.vatRegistered,
    address: partner.address,
    contactName: partner.contactName,
    contactPhone: partner.contactPhone,
    contactEmail: partner.contactEmail,
    commissionRate: partner.commissionRate,
    autoApprove: partner.autoApprove,
    contractVersion: partner.contractVersion,
    contractAcceptedAt: partner.contractAcceptedAt,
    verifiedAt: partner.verifiedAt,
    rejectedReason: partner.rejectedReason,
    vehicleCount: partner._count.vehicles,
    branches: partner.branches,
    documents: partner.documents,
  };
}

/** เพิ่มเอกสารบริษัท (อัปโหลดไฟล์มาก่อนแล้วค่อยเรียก endpoint นี้) */
export async function addVehiclePartnerDocumentService(userId: string, type: string, url: string) {
  const partner = await prisma.vehiclePartner.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partner) {
    throw new Error("ยังไม่ได้สมัครเป็นพาร์ทเนอร์รถเช่า");
  }

  const documentType = text(type);
  if (!(PARTNER_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    throw new Error("ประเภทเอกสารไม่ถูกต้อง");
  }
  if (text(url) === "") {
    throw new Error("ต้องระบุไฟล์เอกสาร");
  }

  return await prisma.vehiclePartnerDocument.create({
    data: { partnerId: partner.id, type: documentType, url: text(url) },
  });
}

/** ยอมรับข้อตกลงพาร์ทเนอร์ (เก็บเวอร์ชัน + เวลาที่ยอมรับ) */
export async function acceptVehiclePartnerContractService(userId: string) {
  const partner = await prisma.vehiclePartner.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partner) {
    throw new Error("ยังไม่ได้สมัครเป็นพาร์ทเนอร์รถเช่า");
  }

  return await prisma.vehiclePartner.update({
    where: { userId },
    data: { contractVersion: PARTNER_CONTRACT_VERSION, contractAcceptedAt: new Date() },
  });
}

/** ตั้งค่าการทำงานของพาร์ทเนอร์ (ตอนนี้มี autoApprove) */
export async function updateVehiclePartnerSettingsService(
  userId: string,
  data: any,
) {
  const payload: { autoApprove?: boolean } = {};
  if (typeof data.autoApprove === "boolean") {
    payload.autoApprove = data.autoApprove;
  }
  if (Object.keys(payload).length === 0) {
    throw new Error("ไม่มีค่าที่ต้องอัปเดต");
  }

  return await prisma.vehiclePartner.update({ where: { userId }, data: payload });
}

// ---------- ฝั่งแอดมิน ----------

/** คิวตรวจ/รายชื่อบริษัทรถเช่า */
export async function listVehiclePartnersForReview(status: string, page: number, size: number) {
  const where = status === "ALL" ? {} : { status: status as any };
  const skip = (page - 1) * size;

  const [items, total] = await Promise.all([
    prisma.vehiclePartner.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip,
      take: size,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        documents: { select: { id: true, type: true, status: true, url: true } },
        _count: { select: { branches: true, vehicles: true } },
      },
    }),
    prisma.vehiclePartner.count({ where }),
  ]);

  return { items, total, page, size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

/** อนุมัติบริษัทรถเช่า → VERIFIED + เอกสารทั้งหมด APPROVED */
export async function verifyVehiclePartnerService(partnerId: string, adminId: string) {
  const now = new Date();

  const [partner] = await prisma.$transaction([
    prisma.vehiclePartner.update({
      where: { id: partnerId },
      data: { status: "VERIFIED", verifiedAt: now, rejectedReason: null },
    }),
    prisma.vehiclePartnerDocument.updateMany({
      where: { partnerId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: now },
    }),
    prisma.moderationLog.create({
      data: {
        adminId,
        targetType: "VEHICLE_PARTNER",
        targetId: partnerId,
        action: "VERIFY_VEHICLE_PARTNER",
      },
    }),
  ]);

  return partner;
}

/** ตีกลับบริษัทรถเช่า พร้อมเหตุผล */
export async function rejectVehiclePartnerService(
  partnerId: string,
  adminId: string,
  reason: string,
) {
  const [partner] = await prisma.$transaction([
    prisma.vehiclePartner.update({
      where: { id: partnerId },
      data: { status: "REJECTED", rejectedReason: reason },
    }),
    prisma.moderationLog.create({
      data: {
        adminId,
        targetType: "VEHICLE_PARTNER",
        targetId: partnerId,
        action: "REJECT_VEHICLE_PARTNER",
        reason,
      },
    }),
  ]);

  return partner;
}

/** แอดมินปรับค่าคอม (0-100%) + บันทึก audit log ทุกครั้ง */
export async function updateVehiclePartnerCommissionService(
  partnerId: string,
  adminId: string,
  rate: number,
  reason: string,
) {
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
    throw new Error("ค่าคอมต้องเป็นจำนวนเต็ม 0-100");
  }

  const partner = await prisma.vehiclePartner.findUnique({
    where: { id: partnerId },
    select: { commissionRate: true },
  });
  if (!partner) {
    throw new Error("ไม่พบพาร์ทเนอร์");
  }

  const [updated] = await prisma.$transaction([
    prisma.vehiclePartner.update({ where: { id: partnerId }, data: { commissionRate: rate } }),
    prisma.commissionChangeLog.create({
      data: {
        partnerId,
        oldRate: partner.commissionRate,
        newRate: rate,
        changedBy: adminId,
        reason: reason === "" ? null : reason,
      },
    }),
  ]);

  return updated;
}
