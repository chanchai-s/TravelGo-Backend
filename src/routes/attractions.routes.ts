import express from "express";
import { listAttractions } from "../controllers/attractions.controllers";

const router = express.Router();
router.get("/attractions", listAttractions);
export default router;
