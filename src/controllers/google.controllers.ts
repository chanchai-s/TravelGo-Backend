import type { Request, Response } from 'express';
import googleAuth from '../Util/google.auth';
import {
  findUserByEmailGoogle,
  createUserByGoogle,
  createGoogleToken,
} from '../services/google.services';

const { client, CLIENT_ID } = googleAuth;

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { token, email, name, picture } = req.body as {
      token?: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    let user: any;

    if (token) {
      if (!CLIENT_ID) {
        return res.status(500).json({
          success: false,
          message: 'Google Client ID ยังไม่ได้ตั้งค่าในระบบ',
        });
      }

      const checkToken = await client.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID,
      });

      const payload = checkToken.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({
          success: false,
          message: 'Token ไม่ถูกต้อง หรือไม่พบข้อมูลอีเมล',
        });
      }

      user = await findUserByEmailGoogle(payload.email);
      if (!user) {
        user = await createUserByGoogle({
          email: payload.email,
          name: payload.name ?? null,
          picture: payload.picture ?? null,
        });
      }
    } else if (email && name) {
      user = await findUserByEmailGoogle(email);
      if (!user) {
        user = await createUserByGoogle({
          email,
          name,
          picture: picture ?? null,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบ Token หรือข้อมูล Google ไม่ครบ',
      });
    }

    const accessGoogleToken = await createGoogleToken(user);

    return res.status(200).json({
      success: true,
      message: 'เข้าสู่ระบบ Google สำเร็จ',
      accessToken: accessGoogleToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.log('google Auth Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'การยืนยันตัวตนล้มเหลว กรุณาลองใหม่อีกครั้ง',
    });
  }
};