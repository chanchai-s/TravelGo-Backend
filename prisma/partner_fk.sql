-- Foreign keys for the vehicle-partner domain.
-- The legacy database was created without FK constraints, so the partner tables
-- need them added explicitly. Applied with:
--   npx prisma db execute --file prisma/partner_fk.sql

ALTER TABLE `VehiclePartner` ADD CONSTRAINT `VehiclePartner_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PartnerBranch` ADD CONSTRAINT `PartnerBranch_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VehiclePartnerDocument` ADD CONSTRAINT `VehiclePartnerDocument_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `PartnerBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `VehicleCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VehiclePhoto` ADD CONSTRAINT `VehiclePhoto_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VehicleDocument` ADD CONSTRAINT `VehicleDocument_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VehicleBlock` ADD CONSTRAINT `VehicleBlock_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RentalDetail` ADD CONSTRAINT `RentalDetail_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RentalDetail` ADD CONSTRAINT `RentalDetail_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RentalDetail` ADD CONSTRAINT `RentalDetail_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `PartnerBranch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RentalDetail` ADD CONSTRAINT `RentalDetail_dropoffBranchId_fkey` FOREIGN KEY (`dropoffBranchId`) REFERENCES `PartnerBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_rentalId_fkey` FOREIGN KEY (`rentalId`) REFERENCES `RentalDetail`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PartnerEarning` ADD CONSTRAINT `PartnerEarning_rentalId_fkey` FOREIGN KEY (`rentalId`) REFERENCES `RentalDetail`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PartnerEarning` ADD CONSTRAINT `PartnerEarning_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PartnerEarning` ADD CONSTRAINT `PartnerEarning_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CommissionChangeLog` ADD CONSTRAINT `CommissionChangeLog_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
