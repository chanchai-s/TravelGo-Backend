import prisma from "../lib/prismaClient";
import jwt from "jsonwebtoken";

type GoogleUserInput = {
  email: string;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
};

type GoogleUser = {
  id: string;
  email: string;
  name: string;
  role?: "USER" | "ADMIN" | "OWNER" | null;
  phone?: string | null;
};

export const findUserByEmailGoogle = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

export const createUserByGoogle = async ({
  email,
  name,
  picture,
}: GoogleUserInput) => {
  const userName = name?.trim() || email.split("@")[0] || "user";

  return prisma.user.create({
    data: {
      email,
      name: userName,
      phone: null,
      role: "USER",
      avatarUrl: picture?.trim() || null,
    },
  });
};

export const createGoogleToken = async (user: GoogleUser) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing in environment variables");
  }

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "3d",
  });
};