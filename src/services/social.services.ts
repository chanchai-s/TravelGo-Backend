import axios from "axios";
import { findUserByEmail } from "./auth.services";
import { createUserByGoogle } from "./google.services";

/** ข้อมูลผู้ใช้ที่ผ่านการยืนยันกับผู้ให้บริการภายนอกแล้ว */
export type SocialProfile = {
  provider: "GOOGLE";
  providerUserId: string;
  email: string;
  name: string | null;
  picture: string | null;
};

type GoogleTokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;
};

/**
 * ตรวจ access token ของ Google กับ endpoint tokeninfo
 * - ต้องออกให้ client id ของเราเท่านั้น (กัน token จากแอปอื่น)
 * - อีเมลต้องยืนยันแล้ว ก่อนเอาไปผูกกับบัญชีเดิม
 */
export async function verifyGoogleAccessToken(
  accessToken: string,
): Promise<SocialProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID ยังไม่ได้ตั้งค่าในระบบ");
  }

  const { data } = await axios.get<GoogleTokenInfo>(
    "https://oauth2.googleapis.com/tokeninfo",
    { params: { access_token: accessToken }, timeout: 10_000 },
  );

  if (data.aud !== clientId) {
    throw new Error("Google token นี้ไม่ได้ออกให้แอปของเรา");
  }
  if (!data.sub || !data.email) {
    throw new Error("Google token ไม่มีข้อมูลผู้ใช้");
  }

  const verified =
    data.email_verified === true || data.email_verified === "true";
  if (!verified) {
    throw new Error("อีเมล Google ยังไม่ได้ยืนยัน");
  }

  return {
    provider: "GOOGLE",
    providerUserId: data.sub,
    email: data.email,
    name: data.name ?? null,
    picture: data.picture ?? null,
  };
}

/**
 * หาบัญชีเดิมจากอีเมลที่ผู้ให้บริการยืนยันแล้ว ถ้าไม่มีค่อยสร้างใหม่
 * (บัญชีที่สร้างทาง social จะไม่มีรหัสผ่าน — ล็อกอินด้วยอีเมลไม่ได้)
 */
export async function findOrCreateSocialUser(profile: SocialProfile) {
  const existing = await findUserByEmail(profile.email);
  if (existing) {
    return existing;
  }

  return createUserByGoogle({
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  });
}
