import { Router } from "express";
import authCheck from "../middleware/error.middleware";
import {
  createSavedAddress,
  deleteSavedAddress,
  listSavedAddresses,
  updateSavedAddress,
} from "../controllers/savedAddress.controllers";

const savedAddressRouter = Router();

savedAddressRouter.use(authCheck);

savedAddressRouter.get("/", listSavedAddresses);
savedAddressRouter.post("/", createSavedAddress);
savedAddressRouter.patch("/:id", updateSavedAddress);
savedAddressRouter.delete("/:id", deleteSavedAddress);

export default savedAddressRouter;
