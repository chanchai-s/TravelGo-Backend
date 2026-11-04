import axios from "axios";
import prisma from "../lib/prismaClient";
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

type GoogleUserInfo = {
  sub?: string;
  name?: string;
  given_name?: string;
  picture?: string;
  email?: string;
  email_verified?: string | boolean;
};

/**
 * ตรวจ access token ของ Google กับ endpoint tokeninfo
 * - ต้องออกให้ client id ของเราเท่านั้น (กัน token จากแอปอื่น)
 * - อีเมลต้องยืนยันแล้ว ก่อนเอาไปผูกกับบัญชีเดิม
 * จากนั้นดึงชื่อ/รูปจาก userinfo เพราะ tokeninfo ไม่มีฟิลด์โปรไฟล์
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

  const { data: info } = await axios.get<GoogleUserInfo>(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10_000,
    },
  );

  // กันการสลับ token: sub ของ userinfo ต้องตรงกับ tokeninfo
  if (info.sub !== undefined && info.sub !== data.sub) {
    throw new Error("ข้อมูลผู้ใช้ Google ไม่ตรงกับ token");
  }

  return {
    provider: "GOOGLE",
    providerUserId: data.sub,
    email: data.email,
    name: info.name?.trim() || data.name?.trim() || null,
    picture: info.picture?.trim() || null,
  };
}

/** ชื่อที่ระบบสร้างเอง (ยังไม่เคยตั้งชื่อจริง) — ใช้ชื่อหน้าอีเมลหรือว่าง */
function isAutoName(name: string, email: string): boolean {
  const trimmed = name.trim();
  return trimmed === "" || trimmed === email.split("@")[0];
}

/** รูปที่มาจากผู้ให้บริการ (ไม่ใช่รูปที่ผู้ใช้อัปโหลดเอง) */
function isProviderAvatar(url: string): boolean {
  return url.includes("googleusercontent.com");
}

/**
 * หาบัญชีเดิมจากอีเมลที่ผู้ให้บริการยืนยันแล้ว ถ้าไม่มีค่อยสร้างใหม่
 * - ชื่อ: ทับเฉพาะเมื่อยังเป็นชื่ออัตโนมัติ ไม่ทับชื่อที่ผู้ใช้ตั้งเอง
 * - รูป: อัปเดตตาม Google ถ้ายังว่างหรือเป็นรูปจาก Google เดิม
 */
export async function findOrCreateSocialUser(profile: SocialProfile) {
  const existing = await findUserByEmail(profile.email);
  if (!existing) {
    return createUserByGoogle({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
  }

  const data: { name?: string; avatarUrl?: string } = {};

  if (
    profile.name !== null &&
    profile.name !== "" &&
    isAutoName(existing.name, existing.email)
  ) {
    data.name = profile.name;
  }

  if (
    profile.picture !== null &&
    profile.picture !== existing.avatarUrl &&
    (existing.avatarUrl === null || isProviderAvatar(existing.avatarUrl))
  ) {
    data.avatarUrl = profile.picture;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return prisma.user.update({ where: { id: existing.id }, data });
}
