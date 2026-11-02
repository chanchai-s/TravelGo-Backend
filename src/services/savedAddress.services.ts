import prisma from "../lib/prismaClient";
import { text } from "./rideFare.services";

/** ที่อยู่ที่บันทึกไว้ (บ้าน / ที่ทำงาน) — ใช้ทั้งหน้าเรียกใช้บริการและ profile */

function parseCoord(value: unknown, field: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} ไม่ถูกต้อง`);
  }
  return parsed;
}

export async function listSavedAddressesService(userId: string) {
  return prisma.savedAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function createSavedAddressService(userId: string, input: any) {
  const label = text(input?.label);
  const address = text(input?.address);
  if (label === "") {
    throw new Error("ต้องตั้งชื่อที่อยู่ (เช่น บ้าน, ที่ทำงาน)");
  }
  if (address === "") {
    throw new Error("ต้องระบุที่อยู่");
  }

  const lat = parseCoord(input?.lat, "ละติจูด", -90, 90);
  const lng = parseCoord(input?.lng, "ลองจิจูด", -180, 180);
  const isDefault = Boolean(input?.isDefault);

  if (isDefault) {
    await prisma.savedAddress.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  return prisma.savedAddress.create({
    data: { userId, label, address, lat, lng, isDefault },
  });
}

export async function updateSavedAddressService(userId: string, addressId: string, input: any) {
  const existing = await prisma.savedAddress.findUnique({ where: { id: text(addressId) } });
  if (!existing || existing.userId !== userId) {
    throw new Error("ไม่พบที่อยู่นี้");
  }

  const isDefault = input?.isDefault === undefined ? existing.isDefault : Boolean(input.isDefault);
  if (isDefault) {
    await prisma.savedAddress.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  return prisma.savedAddress.update({
    where: { id: existing.id },
    data: {
      label: input?.label === undefined ? existing.label : text(input.label) || existing.label,
      address: input?.address === undefined ? existing.address : text(input.address) || existing.address,
      lat:
        input?.lat === undefined
          ? existing.lat
          : parseCoord(input.lat, "ละติจูด", -90, 90),
      lng:
        input?.lng === undefined
          ? existing.lng
          : parseCoord(input.lng, "ลองจิจูด", -180, 180),
      isDefault,
    },
  });
}

export async function deleteSavedAddressService(userId: string, addressId: string) {
  const existing = await prisma.savedAddress.findUnique({ where: { id: text(addressId) } });
  if (!existing || existing.userId !== userId) {
    throw new Error("ไม่พบที่อยู่นี้");
  }
  return prisma.savedAddress.delete({ where: { id: existing.id } });
}
