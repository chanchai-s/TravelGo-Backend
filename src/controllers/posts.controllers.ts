import { Request, Response } from "express";
import prisma from "../lib/prismaClient";

export const listUserPosts = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page || 1);
    const size = Number(req.query.size || 20);
    const posts = await prisma.userPost.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: { user: { select: { id: true, name: true } } },
    });
    return res.status(200).json({ success: true, data: posts });
  } catch (error: any) {
    console.error("listUserPosts error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};

export const createUserPost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });
    const { url, type, caption, stayId } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "url required" });
    const post = await prisma.userPost.create({ data: { userId, url, type: type || "image", caption, stayId } });
    return res.status(201).json({ success: true, data: post });
  } catch (error: any) {
    console.error("createUserPost error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};

export const toggleUserPostLike = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });
    const postId = String(req.params.id);
    const existing = await prisma.userPostLike.findUnique({ where: { postId_userId: { postId, userId } } });
    if (existing) {
      await prisma.userPostLike.delete({ where: { postId_userId: { postId, userId } } });
      await prisma.userPost.update({ where: { id: postId }, data: { likes: { decrement: 1 } } });
      const p = await prisma.userPost.findUnique({ where: { id: postId } });
      return res.status(200).json({ success: true, data: { liked: false, likes: p?.likes ?? 0 } });
    }
    await prisma.userPostLike.create({ data: { postId, userId } });
    await prisma.userPost.update({ where: { id: postId }, data: { likes: { increment: 1 } } });
    const p = await prisma.userPost.findUnique({ where: { id: postId } });
    return res.status(200).json({ success: true, data: { liked: true, likes: p?.likes ?? 0 } });
  } catch (error: any) {
    console.error("toggleUserPostLike error:", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};
