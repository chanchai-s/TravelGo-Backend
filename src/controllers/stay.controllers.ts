import { Request, Response } from "express";
import prisma from "../lib/prismaClient";
import { hasAvailability } from "../lib/availability";

function numberOf(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * ค้นหาที่พักของเรา (PUBLISHED เท่านั้น)
 * ตัวกรอง: คำค้น, ช่วงราคา, ดาว, ประเภทที่พัก, สิ่งอำนวย, ช่วงวันที่ (ตัดที่ห้องเต็ม)
 * เรียง: recommended | price_asc | price_desc | rating | newest + แบ่งหน้า
 */
export const getStays = async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const destination = String(q.destination ?? "").trim().toLowerCase();
    const minPrice = numberOf(q.minPrice);
    const maxPrice = numberOf(q.maxPrice);
    const stars = numberOf(q.stars);
    const propertyType = String(q.propertyType ?? "").trim();
    const amenity = String(q.amenity ?? "").trim().toLowerCase();
    const sort = String(q.sort ?? "recommended");
    const page = Math.max(1, numberOf(q.page) ?? 1);
    const size = Math.min(50, Math.max(1, numberOf(q.size) ?? 20));

    const checkIn = typeof q.checkIn === "string" && q.checkIn !== "" ? new Date(q.checkIn) : null;
    const checkOut = typeof q.checkOut === "string" && q.checkOut !== "" ? new Date(q.checkOut) : null;

    // กรองที่ฐานข้อมูลก่อน (เร็วกว่าดึงมาทั้งหมดแล้วค่อยกรอง)
    const stays = await prisma.stay.findMany({
      where: {
        status: "PUBLISHED",
        ...(minPrice !== undefined ? { pricePerNight: { gte: minPrice } } : {}),
        ...(maxPrice !== undefined ? { pricePerNight: { lte: maxPrice } } : {}),
        ...(stars !== undefined ? { stars } : {}),
        ...(propertyType !== "" ? { propertyType: propertyType as any } : {}),
      },
      include: { photos: true, amenities: true, roomTypes: true },
    });

    let filtered = stays.filter((stay) => {
      const haystack = `${stay.name} ${stay.location} ${stay.addressLine ?? ""}`.toLowerCase();
      if (destination !== "" && !haystack.includes(destination)) {
        return false;
      }
      if (amenity !== "") {
        const list = [
          ...(Array.isArray(stay.amenities?.generalAmenities) ? stay.amenities!.generalAmenities! : []),
          ...(Array.isArray(stay.amenities?.roomAmenities) ? stay.amenities!.roomAmenities! : []),
          ...(Array.isArray(stay.amenities?.diningServices) ? stay.amenities!.diningServices! : []),
        ].map((item) => String(item).toLowerCase());
        if (!list.some((item) => item.includes(amenity))) {
          return false;
        }
      }
      return true;
    });

    // ตัดประกาศที่ห้องเต็มในช่วงวันที่ที่เลือก
    if (checkIn && checkOut && !Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
      const open: string[] = [];
      for (const stay of filtered) {
        if (await hasAvailability(stay.id, checkIn, checkOut)) {
          open.push(stay.id);
        }
      }
      filtered = filtered.filter((stay) => open.includes(stay.id));
    }

    const map = (stay: (typeof filtered)[number]) => ({
      id: stay.id,
      source: "WANDERGO",
      name: stay.name,
      location: stay.location,
      country: "Thailand",
      price: stay.pricePerNight,
      rating: stay.rating ?? 0,
      reviews: stay.reviewCount,
      stars: stay.stars ?? 0,
      propertyType: stay.propertyType,
      image: stay.photos[0]?.url ?? stay.imageUrl ?? "",
      isNew: Date.now() - stay.createdAt.getTime() < 14 * 86400000,
    });

    const items = filtered.map(map);

    if (sort === "price_asc") {
      items.sort((a, b) => a.price - b.price);
    } else if (sort === "price_desc") {
      items.sort((a, b) => b.price - a.price);
    } else if (sort === "rating") {
      items.sort((a, b) => b.rating - a.rating);
    } else if (sort === "newest") {
      // ใหม่สุดมาก่อน (ใช้ isNew ก่อน แล้วจึงคะแนน)
      items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.rating - a.rating);
    } else {
      // recommended: ของใหม่มาก่อน ตามด้วยคะแนน
      items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.rating - a.rating);
    }

    const start = (page - 1) * size;
    return res.status(200).json({
      success: true,
      items: items.slice(start, start + size),
      total: items.length,
      page,
      size,
      totalPages: Math.max(1, Math.ceil(items.length / size)),
    });
  } catch (error: any) {
    console.error("Error searching stays:", error.message);
    return res.status(500).json({ success: false, message: "Failed to search stays" });
  }
};

// รายละเอียดที่พักของ owner 1 หลัง (หน้า detail ฝั่ง WANDERGO)
export const getStayById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const stay = await prisma.stay.findFirst({
      where: { id, status: "PUBLISHED" },
      include: {
        photos: true,
        amenities: true,
        policy: true,
        nearby: true,
        roomTypes: { include: { beds: true } },
        wholeProperty: { include: { beds: true } },
        uniqueDetail: true,
      },
    });

    if (!stay) {
      return res.status(404).json({ success: false, message: "Stay not found" });
    }
    return res.status(200).json({ success: true, data: stay });
  } catch (error: any) {
    console.error("Error fetching stay:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch stay" });
  }
};
