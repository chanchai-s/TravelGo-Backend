import { Request, Response } from "express";
import prisma from "../lib/prismaClient";
import cloudinary from "../lib/cloudinary";
import { upload } from "../middleware/multer";

/**
 * อัปโหลดวิดีโอหรือรูปภาพขึ้น Cloudinary
 * Body: form-data { file: File, caption?: string, stayId?: string }
 */
export const uploadMedia = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;
    if (!file) {
      return res.status(400).json({ success: false, message: "ไม่พบไฟล์ที่อัปโหลด" });
    }

    const { caption, stayId } = req.body;

    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: "auto",
      folder: "wandergo/media",
    });

    return res.status(200).json({
      success: true,
      message: "อัปโหลดวิดีโอสำเร็จ",
      data: {
        id: result.public_id,
        url: result.secure_url,
        type: result.resource_type,
        width: result.width,
        height: result.height,
        duration: result.duration || 0,
      },
    });
  } catch (error: any) {
    console.error("อัปโหลดวิดีโอไม่สำเร็จ:", error);
    return res.status(500).json({ success: false, message: "อัปโหลดวิดีโอไม่สำเร็จ" });
  }
};

/**
 * ดึงรายการวิดีโอทั้งหมด (สำหรับหน้า feed เหมือน TikTok/Reels)
 */
export const getMediaFeed = async (req: Request, res: Response) => {
  try {
    const stays = await prisma.stay.findMany({
      where: { status: "PUBLISHED" },
      include: { photos: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    const fromDb = stays
      .filter((s) => s.photos && s.photos.length > 0)
      .map((s) => ({
        id: s.id,
        url: s.photos[0]!.url,
        name: s.name,
        location: s.location,
        pricePerNight: Number(s.pricePerNight),
        likes: 0,
        comments: 0,
        caption: s.description || s.name,
      }));

    const data = fromDb.length > 0 ? fromDb : [
      {
        id: "1",
        url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
        name: "Demo Riverside Hotel",
        location: "Bangkok Riverside",
        pricePerNight: 4500,
        likes: 1250,
        comments: 45,
        caption: "ลักซ์ชัวรีริเวอร์ไซด์พาเลซ",
      },
    ];

    return res.status(200).json({
      success: true,
      message: "ดึงข้อมูลวิดีโอสำเร็จ",
      data,
    });
  } catch (error: any) {
    console.error("ดึงข้อมูลวิดีโอไม่สำเร็จ:", error);
    return res.status(500).json({ success: false, message: "ดึงข้อมูลวิดีโอไม่สำเร็จ" });
  }
};
export const toggleMediaLike = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });
    const mediaId = String(req.params.id);
    const existing = await prisma.mediaLike.findUnique({ where: { mediaId_userId: { mediaId, userId } } });
    if (existing) {
      await prisma.mediaLike.delete({ where: { mediaId_userId: { mediaId, userId } } });
      const count = await prisma.mediaLike.count({ where: { mediaId } });
      return res.status(200).json({ success: true, data: { liked: false, likes: count } });
    }
    await prisma.mediaLike.create({ data: { mediaId, userId } });
    const count = await prisma.mediaLike.count({ where: { mediaId } });
    return res.status(200).json({ success: true, data: { liked: true, likes: count } });
  } catch (error: any) {
    console.error("toggleMediaLike error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};

export const getMediaComments = async (req: Request, res: Response) => {
  try {
    const mediaId = String(req.params.id);
    const comments = await prisma.mediaComment.findMany({
      where: { mediaId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return res.status(200).json({ success: true, data: comments });
  } catch (error: any) {
    console.error("getMediaComments error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};

export const addMediaComment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });
    const mediaId = String(req.params.id);
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: "text required" });
    const comment = await prisma.mediaComment.create({ data: { mediaId, userId, text } });
    return res.status(201).json({ success: true, data: comment });
  } catch (error: any) {
    console.error("addMediaComment error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};
