import type { Request, Response } from "express";
import {
  checkVehicleAvailabilityService,
  getVehicleDetailService,
  listVehicleCategoriesService,
  quoteVehicleService,
  searchVehiclesService,
} from "../services/vehicleCatalog.services";

const NOT_FOUND = /ไม่พบ/;

function fail(res: Response, error: any, fallback = 400) {
  const message = String(error?.message ?? "เกิดข้อผิดพลาด");
  const code = NOT_FOUND.test(message) ? 404 : fallback;
  return res.status(code).json({ success: false, message });
}

export async function listVehicleCategories(_req: Request, res: Response) {
  try {
    const data = await listVehicleCategoriesService();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function searchVehicles(req: Request, res: Response) {
  try {
    const data = await searchVehiclesService({
      q: req.query.q,
      categorySlug: req.query.category,
      branchId: req.query.branchId,
      pickupAt: req.query.pickupAt,
      dropoffAt: req.query.dropoffAt,
      transmission: req.query.transmission,
      minSeats: req.query.minSeats,
      maxPrice: req.query.maxPrice,
      page: req.query.page,
      size: req.query.size,
    });
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error, 500);
  }
}

export async function getVehicleDetail(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await getVehicleDetailService(id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function checkVehicleAvailability(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  try {
    const data = await checkVehicleAvailabilityService(
      id,
      req.query.pickupAt,
      req.query.dropoffAt,
    );
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}

export async function quoteVehicle(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const pickupAt = req.body?.pickupAt ?? req.query.pickupAt;
  const dropoffAt = req.body?.dropoffAt ?? req.query.dropoffAt;
  try {
    const data = await quoteVehicleService(id, pickupAt, dropoffAt);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return fail(res, error);
  }
}
