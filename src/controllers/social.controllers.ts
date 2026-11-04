import type { Request, Response } from "express";
import { createToken } from "../services/auth.services";
import {
  findOrCreateSocialUser,
  verifyGoogleAccessToken,
} from "../services/social.services";

/**
 * POST /auth/social
 * รับข้อมูลจากผู้ให้บริการภายนอกแล้วออก JWT ของเราเอง
 * ตอนนี้รองรับ Google (access token) — Facebook/Apple/LINE จะเติมภายหลัง
 */
export async function socialLogin(req: Request, res: Response) {
  try {
    const { provider, accessToken } = (req.body ?? {}) as {
      provider?: string;
      accessToken?: string;
    };

    if (provider !== "GOOGLE") {
      return res.status(400).json({
        message: "ยังไม่รองรับผู้ให้บริการนี้",
      });
    }

    if (typeof accessToken !== "string" || accessToken === "") {
      return res.status(400).json({
        message: "ไม่พบ token จาก Google",
      });
    }

    const profile = await verifyGoogleAccessToken(accessToken);
    const user = await findOrCreateSocialUser(profile);

    const token = await createToken({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ยืนยันตัวตนไม่สำเร็จ";
    console.error("[social] เข้าสู่ระบบไม่สำเร็จ:", message);

    return res.status(401).json({
      message: "ยืนยันตัวตนกับ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    });
  }
}
