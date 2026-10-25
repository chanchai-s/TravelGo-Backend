import express from "express";
import { Destination, getHotelDetails, searchHotels } from "../controllers/rabitapi.controllers";

const rabitRoutes = express.Router();

rabitRoutes.get("/destinations", Destination);
rabitRoutes.post("/destinations", Destination);
rabitRoutes.get("/search", searchHotels);
rabitRoutes.post("/search", searchHotels);
rabitRoutes.get("/hotel/:id", getHotelDetails);

export default rabitRoutes