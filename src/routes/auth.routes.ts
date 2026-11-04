import express from "express";
import * as authController from "../controllers/auth.controllers";
import { socialLogin } from "../controllers/social.controllers";
import authCheck from "../middleware/error.middleware";

const authRoutes = express.Router();

authRoutes.post("/register", authController.register as any);
authRoutes.post("/login", authController.login);
authRoutes.post("/social", socialLogin);
authRoutes.get("/me", authCheck, authController.getMe);
authRoutes.put("/me", authCheck, authController.updateMe);
authRoutes.post("/set-password", authCheck, authController.setPassword);

export default authRoutes;

