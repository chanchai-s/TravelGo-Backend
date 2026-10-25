import { Request, Response } from "express";
import prisma from "../lib/prismaClient";

const mockActivities = [
  { title: "Snorkeling Trip", rating: 4.8, reviewCount: 120, duration: "Half day", pricePerPerson: 1200, oldPrice: 1500, perks: ["Equipment included", "Guide"], imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80" },
  { title: "City Tour", rating: 4.6, reviewCount: 80, duration: "Full day", pricePerPerson: 900, oldPrice: null, perks: ["Transport", "Lunch"], imageUrl: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80" },
];

export const listActivities = async (req: Request, res: Response) => {
  const status = String(req.query.status || "PUBLISHED");
  const data = await prisma.activity.findMany({ where: { status }, orderBy: { createdAt: "desc" } });
  if (data.length === 0) {
    // seed mock if empty
    for (const m of mockActivities) {
      await prisma.activity.create({ data: { ...m, status: "PUBLISHED", createdBy: "ADMIN" } }).catch(() => {});
    }
    const seeded = await prisma.activity.findMany({ where: { status }, orderBy: { createdAt: "desc" } });
    return res.status(200).json({ success: true, data: seeded });
  }
  return res.status(200).json({ success: true, data });
};

export const getActivity = async (req: Request, res: Response) => {
  const a = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!a) return res.status(404).json({ success: false, message: "Not found" });
  return res.status(200).json({ success: true, data: a });
};

export const createActivityBooking = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const a = await prisma.activity.findUnique({ where: { id: String(req.params.id) } });
  if (!a) return res.status(404).json({ success: false, message: "Not found" });
  const persons = Math.max(1, Number(req.body.persons) || 1);
  const totalPrice = a.pricePerPerson * persons;
  const booking = await prisma.booking.create({
    data: { ref: "WG-" + Math.random().toString(36).slice(2, 8).toUpperCase(), userId, type: "ACTIVITY", status: "UPCOMING", totalPrice, travelDate: req.body.date ? new Date(req.body.date) : new Date() },
  });
  return res.status(201).json({ success: true, data: booking });
};

export const adminCreateActivity = async (req: Request, res: Response) => {
  try {
    const { title, rating, duration, pricePerPerson, oldPrice, perks, imageUrl, status } = req.body;
    const a = await prisma.activity.create({ data: { title, rating, duration, pricePerPerson, oldPrice, perks: perks || [], imageUrl, status: status || "PUBLISHED", createdBy: "ADMIN" } });
    return res.status(201).json({ success: true, data: a });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const adminUpdateActivity = async (req: Request, res: Response) => {
  const a = await prisma.activity.update({ where: { id: String(req.params.id) }, data: req.body }).catch(() => null);
  return res.status(200).json({ success: true, data: a });
};

export const adminDeleteActivity = async (req: Request, res: Response) => {
  await prisma.activity.delete({ where: { id: String(req.params.id) } }).catch(() => {});
  return res.status(200).json({ success: true });
};

export const hostSubmitActivity = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const host = await prisma.hostProfile.findUnique({ where: { userId } });
  const { title, duration, pricePerPerson, perks, imageUrl } = req.body;
  const a = await prisma.activity.create({ data: { title, duration, pricePerPerson, perks: perks || [], imageUrl, status: "PENDING", createdBy: "HOST", hostId: host?.id ?? null } });
  return res.status(201).json({ success: true, data: a });
};

export const hostListActivities = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Login required" });
  const host = await prisma.hostProfile.findUnique({ where: { userId } });
  if (!host) return res.status(200).json({ success: true, data: [] });
  const data = await prisma.activity.findMany({ where: { hostId: host.id }, orderBy: { createdAt: "desc" } });
  return res.status(200).json({ success: true, data });
};

export const adminApproveActivity = async (req: Request, res: Response) => {
  const a = await prisma.activity.update({ where: { id: String(req.params.id) }, data: { status: "PUBLISHED" } }).catch(() => null);
  return res.status(200).json({ success: true, data: a });
};

export const adminRejectActivity = async (req: Request, res: Response) => {
  const { reason } = req.body;
  const a = await prisma.activity.update({ where: { id: String(req.params.id) }, data: { status: "REJECTED", rejectedReason: reason || null } }).catch(() => null);
  return res.status(200).json({ success: true, data: a });
};
