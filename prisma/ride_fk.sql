-- Foreign keys for the ride domain.
-- The legacy database was created without FK constraints, so these are added explicitly.
-- Applied with:
--   npx prisma db execute --file prisma/ride_fk.sql

ALTER TABLE `DriverVehicle` ADD CONSTRAINT `DriverVehicle_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DriverDocument` ADD CONSTRAINT `DriverDocument_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SavedAddress` ADD CONSTRAINT `SavedAddress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RideJob` ADD CONSTRAINT `RideJob_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RideJob` ADD CONSTRAINT `RideJob_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `RideJob` ADD CONSTRAINT `RideJob_tierCode_fkey` FOREIGN KEY (`tierCode`) REFERENCES `RideTier`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RideAddon` ADD CONSTRAINT `RideAddon_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ParcelDetail` ADD CONSTRAINT `ParcelDetail_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RideStatusLog` ADD CONSTRAINT `RideStatusLog_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RidePayment` ADD CONSTRAINT `RidePayment_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DriverEarning` ADD CONSTRAINT `DriverEarning_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RideRating` ADD CONSTRAINT `RideRating_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RideMessage` ADD CONSTRAINT `RideMessage_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RideSosEvent` ADD CONSTRAINT `RideSosEvent_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `RideJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
