import express from "express";
import { getStayById, getStays } from "../controllers/stay.controllers";

const stayRoutes = express.Router();

stayRoutes.get("/search", getStays);
stayRoutes.get("/:id", getStayById);

export default stayRoutes;
