import type { Request, Response } from "express";
import {
  createSavedAddressService,
  deleteSavedAddressService,
  listSavedAddressesService,
  updateSavedAddressService,
} from "../services/savedAddress.services";
import { fail, paramOf } from "../lib/rideHttp";

export async function listSavedAddresses(req: Request, res: Response) {
  try {
    const data = await listSavedAddressesService(req.user?.id ?? "");
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function createSavedAddress(req: Request, res: Response) {
  try {
    const data = await createSavedAddressService(req.user?.id ?? "", req.body ?? {});
    return res.status(201).json({ success: true, message: "บันทึกที่อยู่แล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function updateSavedAddress(req: Request, res: Response) {
  try {
    const data = await updateSavedAddressService(
      req.user?.id ?? "",
      paramOf(req.params.id),
      req.body ?? {},
    );
    return res.status(200).json({ success: true, message: "อัปเดตที่อยู่แล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function deleteSavedAddress(req: Request, res: Response) {
  try {
    const data = await deleteSavedAddressService(req.user?.id ?? "", paramOf(req.params.id));
    return res.status(200).json({ success: true, message: "ลบที่อยู่แล้ว", data });
  } catch (error: any) {
    return fail(res, error);
  }
}
