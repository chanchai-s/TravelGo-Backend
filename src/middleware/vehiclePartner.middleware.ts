import createError from "http-errors";
import type { Request, Response, NextFunction } from "express";
import prisma from "../lib/prismaClient";

/**
 * ต้องเป็นบริษัทรถเช่าที่ผ่านการยืนยันแล้วเท่านั้น
 * ใช้ต่อจาก authCheck เสมอ (ต้องมี req.user)
 */
export async function requireVehiclePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError(401, "Unauthorization");
    }

    const partner = await prisma.vehiclePartner.findUnique({ where: { userId } });
    if (!partner) {
      return res.status(403).json({ success: false, message: "ต้องสมัครเป็นพาร์ทเนอร์รถเช่าก่อน" });
    }
    if (partner.status !== "VERIFIED") {
      return res
        .status(403)
        .json({ success: false, message: "พาร์ทเนอร์รถเช่ายังไม่ผ่านการยืนยัน" });
    }

    req.vehiclePartner = {
      id: partner.id,
      companyName: partner.companyName,
      status: partner.status,
      commissionRate: partner.commissionRate,
      autoApprove: partner.autoApprove,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export default requireVehiclePartner;
