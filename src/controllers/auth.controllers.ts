declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        role?: string | null;
      };
    }
  }
}

import createError from "http-errors";
import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";
import { findUserByEmail, createUser, createToken, editUserProfile, updateUserPassword } from "../services/auth.services";
import prisma from "../lib/prismaClient";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, phone, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string | null;
      password?: string;
    };

    if (!name || !email || !password) {
      throw createError(400, "Name, email and password are required");
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      throw createError(409, "Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser({
      name,
      email,
      phone: phone ?? null,
      password: hashedPassword,
      role: "USER",
    });

    const token = await createToken({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });

    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body as { email?: string; password?: string };

  try {
    if (!email || !password) {
      throw createError(400, "Email and password are required");
    }

    const user = await findUserByEmail(email);
    if (!user) {
      throw createError(401, "Invalid credentials");
    }

    const storedPassword = user.password;
    if (storedPassword) {
      const isMatch = await bcrypt.compare(password, storedPassword);
      if (!isMatch) {
        throw createError(401, "Invalid credentials");
      }
    } else {
      throw createError(401, "This account does not support email/password login");
    }

    const token = await createToken({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw createError(404, "User not found");
    }

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        hasPassword: Boolean(user.password),
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const { name, email, phone } = req.body as {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    };

    const updatedUser = await editUserProfile({
      id: userId,
      name,
      email,
      phone,
    });

    return res.status(200).json({
      message: "อัปเดตโปรไฟล์สำเร็จ",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        avatarUrl: updatedUser.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ตั้งรหัสผ่านครั้งแรก (user เก่าที่ยังไม่มี password) หรือเปลี่ยนรหัสผ่าน
export async function setPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const { password, currentPassword } = req.body as {
      password?: string;
      currentPassword?: string;
    };

    if (!password || password.length < 8) {
      throw createError(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw createError(404, "ไม่พบผู้ใช้");
    }

    if (user.password) {
      if (!currentPassword) {
        throw createError(400, "กรุณากรอกรหัสผ่านเดิม");
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        throw createError(401, "รหัสผ่านเดิมไม่ถูกต้อง");
      }
    }

    await updateUserPassword(userId, await bcrypt.hash(password, 10));

    return res.status(200).json({
      success: true,
      message: "ตั้งรหัสผ่านสำเร็จ",
    });
  } catch (error) {
    next(error);
  }
}
