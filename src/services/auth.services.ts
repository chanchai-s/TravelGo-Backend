import prisma from "../lib/prismaClient";
import jwt from "jsonwebtoken";

type UserPayload = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role?: "USER" | "ADMIN" | "OWNER" | null;
};

type UserProfileInput = {
  id: string;
  name?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
};

export const findUserByEmail = async (email: string) => {
  return prisma.user.findFirst({
    where: { email },
  });
};

export const createToken = async (user: UserPayload) => {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "3d",
  });
};

export const findUserById = async (id: string) => {
  return prisma.user.findFirst({
    where: { id },
  });
};

export const editUserProfile = async ({
  id,
  name,
  phone,
  email,
}: UserProfileInput) => {
  const payload: Record<string, string | null | undefined> = {};

  if (name !== undefined) payload.name = name;
  if (phone !== undefined) payload.phone = phone;
  if (email !== undefined) payload.email = email;

  return prisma.user.update({
    where: { id },
    data: payload,
  });
};

export const createUser = async ({
  name,
  email,
  phone,
  password,
  role,
}: {
  name: string;
  email: string;
  phone?: string | null;
  password?: string | null;
  role?: "USER" | "ADMIN" | "OWNER";
}) => {
  return prisma.user.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      password: password ?? null,
      role: role ?? "USER",
    },
  });
};

// ตั้ง/เปลี่ยนรหัสผ่าน — ใช้ทั้งตอนสมัครและตอน user เก่าตั้งรหัสครั้งแรก
export const updateUserPassword = async (id: string, password: string) => {
  return prisma.user.update({
    where: { id },
    data: { password },
  });
};