import { Request, Response } from "express";
import prisma from "../lib/prismaClient";

export const adminListVouchers = async (req: Request, res: Response) => {
  const data = await prisma.voucher.findMany({ orderBy: { createdAt: "desc" } });
  return res.status(200).json({ success: true, data });
};

export const adminCreateVoucher = async (req: Request, res: Response) => {
  try {
    const { code, title, type, value, minSpend, maxDiscount, category, condition, scope, stayId, hostId, restricted, tier, usageLimit, expiresAt, userIds } = req.body;
    const v = await prisma.voucher.create({
      data: { code, title, type: type || "PERCENT", value: value || 0, minSpend: minSpend || 0, maxDiscount, category: category || "GENERAL", condition, scope: scope || "ALL", stayId, hostId, restricted: !!restricted, tier, usageLimit: usageLimit || 0, expiresAt: expiresAt ? new Date(expiresAt) : null },
    });
    if (restricted && Array.isArray(userIds)) {
      for (const uid of userIds) {
        await prisma.voucherAssignment.create({ data: { voucherId: v.id, userId: uid } }).catch(() => {});
        await prisma.voucherWallet.create({ data: { userId: uid, voucherId: v.id } }).catch(() => {});
      }
    }
    return res.status(201).json({ success: true, data: v });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminDeleteVoucher = async (req: Request, res: Response) => {
  await prisma.voucher.delete({ where: { id: String(req.params.id) } }).catch(() => {});
  return res.status(200).json({ success: true });
};

export const listMyVouchers = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const wallets = await prisma.voucherWallet.findMany({ where: { userId }, include: { voucher: true } });
  return res.status(200).json({ success: true, data: wallets.map((w) => w.voucher) });
};

export const validateVoucher = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { code, stayId, amount } = req.body;
    const v = await prisma.voucher.findUnique({ where: { code } });
    if (!v) return res.status(404).json({ success: false, message: "ไม่พบคูปอง" });
    if (v.status !== "APPROVED") return res.status(400).json({ success: false, message: "คูปองยังไม่ได้รับการอนุมัติ" });
    if (v.expiresAt && v.expiresAt < new Date()) return res.status(400).json({ success: false, message: "หมดอายุ" });
    if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) return res.status(400).json({ success: false, message: "ใช้ครบแล้ว" });
    if (v.minSpend > 0 && (amount || 0) < v.minSpend) return res.status(400).json({ success: false, message: "ยอดไม่ถึงขั้นต่ำ" });
    if (v.scope === "STAY" && v.stayId && v.stayId !== stayId) return res.status(400).json({ success: false, message: "ไม่ใช่ที่พักนี้" });
    if (v.restricted && userId) {
      const a = await prisma.voucherAssignment.findUnique({ where: { voucherId_userId: { voucherId: v.id, userId } } });
      if (!a) return res.status(403).json({ success: false, message: "คูปองนี้ไม่ได้สำหรับคุณ" });
    }
    if (v.tier && userId) {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (u?.tier !== v.tier) return res.status(403).json({ success: false, message: "เฉพาะสมาชิก tier " + v.tier });
    }
    let discount = v.type === "PERCENT" ? Math.round(((amount || 0) * v.value) / 100) : v.value;
    if (v.maxDiscount) discount = Math.min(discount, v.maxDiscount);
    return res.status(200).json({ success: true, data: { voucher: v, discount } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const claimVoucher = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const { code } = req.body;
  const v = await prisma.voucher.findUnique({ where: { code } });
  if (!v) return res.status(404).json({ success: false, message: "ไม่พบคูปอง" });
  if (v.restricted) {
    const a = await prisma.voucherAssignment.findUnique({ where: { voucherId_userId: { voucherId: v.id, userId } } });
    if (!a) return res.status(403).json({ success: false, message: "คูปองนี้ไม่ได้สำหรับคุณ" });
  }
  await prisma.voucherWallet.create({ data: { userId, voucherId: v.id } }).catch(() => {});
  return res.status(200).json({ success: true, data: v });
};

export const hostCreateVoucher = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required" });
    const { code, title, type, value, minSpend, maxDiscount, stayId, expiresAt } = req.body;
    if (!code || !title) return res.status(400).json({ success: false, message: "code/title required" });
    const v = await prisma.voucher.create({
      data: { code, title, type: type || "PERCENT", value: value || 0, minSpend: minSpend || 0, maxDiscount, scope: "STAY", stayId, hostId: userId, restricted: false, usageLimit: 0, status: "PENDING", expiresAt: expiresAt ? new Date(expiresAt) : null },
    });
    return res.status(201).json({ success: true, data: v });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminApproveVoucher = async (req: Request, res: Response) => {
  const v = await prisma.voucher.update({ where: { id: String(req.params.id) }, data: { status: "APPROVED" } }).catch(() => null);
  return res.status(200).json({ success: true, data: v });
};

export const adminRejectVoucher = async (req: Request, res: Response) => {
  const { reason } = req.body;
  const v = await prisma.voucher.update({ where: { id: String(req.params.id) }, data: { status: "REJECTED" } }).catch(() => null);
  return res.status(200).json({ success: true, data: v });
};

export const hostListVouchers = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const data = await prisma.voucher.findMany({ where: { hostId: userId }, orderBy: { createdAt: "desc" } });
  return res.status(200).json({ success: true, data });
};
