import express from "express";
import "dotenv/config";
import cors from "cors";
import path from "node:path";
import authRoutes from "./routes/auth.routes";
import googleRoutes from "./routes/google.routes";
import rabitRoutes from "./routes/rabit.routes"; 
import fightRoutes from "./routes/flight.routes";
import hostRouter from "./routes/host.routes";
import mediaRoutes from "./routes/media.routes";
import activitiesRoutes from "./routes/activities.routes";
import vouchersRoutes from "./routes/vouchers.routes";
import attractionsRoutes from "./routes/attractions.routes";
import postRoutes from "./routes/posts.routes";
import stayRoutes from "./routes/stay.routes";
import uploadRoutes from "./routes/upload.routes";
import adminRoutes from "./routes/admin.routes";
import bookingRoutes from "./routes/booking.routes";
import partnerRoutes from "./routes/partner.routes";
import partnerVehicleRoutes from "./routes/partnerVehicle.routes";
import vehicleCatalogRoutes from "./routes/vehicleCatalog.routes";
import { ensureUploadDir } from "./lib/upload";
import { startDraftCleanup } from "./jobs/draftCleanup";
import { startUploadCleanup } from "./jobs/uploadCleanup";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

app.use(express.json());

// เสิร์ฟไฟล์ที่อัปโหลด (รูปที่พัก + เอกสารยืนยัน)
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
ensureUploadDir();

app.use("/auth", authRoutes);
app.use("/google", googleRoutes);
app.use("/rabit", rabitRoutes); 
app.use('/flights', fightRoutes);
app.use('/host', hostRouter);
app.use('/properties', hostRouter);
app.use('/media', mediaRoutes );
app.use('/', activitiesRoutes);
app.use('/', vouchersRoutes);
app.use('/', attractionsRoutes);
app.use('/', postRoutes);
app.use('/', vehicleCatalogRoutes);
app.use('/stays', stayRoutes);
app.use('/upload', uploadRoutes);
app.use('/admin', adminRoutes);
app.use('/bookings', bookingRoutes);
app.use('/partner', partnerRoutes);
app.use('/partner', partnerVehicleRoutes);

startDraftCleanup();
startUploadCleanup();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});