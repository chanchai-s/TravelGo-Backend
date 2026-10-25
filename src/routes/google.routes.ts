import express from "express";
import { googleLogin } from "../controllers/google.controllers";

const googleRoutes = express.Router();

googleRoutes.post("/create", googleLogin);

googleRoutes.post("/login", googleLogin);

export default googleRoutes;