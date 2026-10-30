import { Router } from "express";
import {
  checkVehicleAvailability,
  getVehicleDetail,
  listVehicleCategories,
  quoteVehicle,
  searchVehicles,
} from "../controllers/vehicleCatalog.controllers";

const vehicleCatalogRouter = Router();

// ---------- แคตตาล็อกสาธารณะ ----------
vehicleCatalogRouter.get("/vehicle-categories", listVehicleCategories);
vehicleCatalogRouter.get("/vehicles", searchVehicles);
vehicleCatalogRouter.get("/vehicles/:id", getVehicleDetail);
vehicleCatalogRouter.get("/vehicles/:id/availability", checkVehicleAvailability);
vehicleCatalogRouter.post("/vehicles/:id/quote", quoteVehicle);

export default vehicleCatalogRouter;
