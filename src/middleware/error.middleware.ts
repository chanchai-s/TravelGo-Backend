import createError from 'http-errors';
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { findUserById } from '../services/auth.services';

async function authCheck(req: Request, res: Response, next: NextFunction) {
    try {
        const authorization = req.headers.authorization;
        if (!authorization) {
            throw createError(401, "Unauthorization");
        }

        const token = authorization.split(" ")[1];
        if (!token) {
            throw createError(401, "Unauthorization");
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET as string, {
            algorithms: ['HS256']
        }) as { id: string };

        const user = await findUserById(payload.id);
        if (!user) {
            throw createError(401, "Unauthorization");
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

// ถ้ามี token ที่ถูกต้องก็ผูก req.user ให้ ถ้าไม่มี/ไม่ถูกต้องก็ไปต่อแบบไม่ระบุตัวตน
// *error ระบบ/ฐานข้อมูล ต้องปล่อยให้ error handler จัดการ ไม่งั้นจะกลายเป็น 403 ที่งง*
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    const authorization = req.headers.authorization;
    const token = authorization?.split(" ")[1];

    if (!token) {
        return next();
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string, {
            algorithms: ['HS256']
        }) as { id: string };

        const user = await findUserById(payload.id);
        if (user) {
            req.user = user;
        }
    } catch (error: any) {
        const isTokenProblem =
            error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError';
        if (!isTokenProblem) {
            console.error('[optionalAuth] ตรวจสอบผู้ใช้ไม่สำเร็จ:', error.message);
            return next(error);
        }
        // ไม่มี/โทเคนไม่ถูกต้อง = ถือว่าไม่ได้ล็อกอิน แล้วไปต่อ
    }
    next();
}

// สิทธิ์แอดมิน — ใช้หลัง authCheck (role อ่านสดจาก DB ทุก request)
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
    if (req.user?.role !== 'ADMIN') {
        return next(createError(403, 'Admin only'));
    }
    next();
}

export default authCheck