-- Vehicle Partner schema (Phase 1)
-- Generated from the Prisma schema diff and applied manually via:
--   npx prisma db execute --file prisma/partner_schema.sql
-- Note: prisma db push currently fails on pre-existing FK index drift
-- (e.g. Activity_hostId_fkey), so this SQL is the source of truth for now.
ALTER TABLE `review` ADD COLUMN `vehicleId` VARCHAR(191) NULL;

ALTER TABLE `vehicle` ADD COLUMN `advanceBookingDays` INTEGER NULL,
    ADD COLUMN `allowOneWay` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `branchId` VARCHAR(191) NULL,
    ADD COLUMN `brand` VARCHAR(191) NULL,
    ADD COLUMN `categoryId` VARCHAR(191) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deliveryAvailable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `depositAmount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `doors` INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN `licensePlate` VARCHAR(191) NULL,
    ADD COLUMN `maxRentalDays` INTEGER NULL,
    ADD COLUMN `minRentalDays` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `modelYear` INTEGER NULL,
    ADD COLUMN `partnerId` VARCHAR(191) NULL,
    ADD COLUMN `specs` JSON NULL,
    ADD COLUMN `status` ENUM('DRAFT', 'PENDING', 'PUBLISHED', 'PAUSED', 'MAINTENANCE', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `supportsChauffeur` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `supportsSelfDrive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

CREATE TABLE `VehiclePartner` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `companyName` VARCHAR(191) NOT NULL,
    `taxId` VARCHAR(191) NOT NULL,
    `companyRegNo` VARCHAR(191) NULL,
    `vatRegistered` BOOLEAN NOT NULL DEFAULT false,
    `address` VARCHAR(191) NOT NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `contactPhone` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NULL,
    `commissionRate` INTEGER NULL,
    `autoApprove` BOOLEAN NOT NULL DEFAULT false,
    `contractVersion` VARCHAR(191) NULL,
    `contractAcceptedAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `rejectedReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VehiclePartner_userId_key`(`userId`),
    INDEX `VehiclePartner_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PartnerBranch` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `phone` VARCHAR(191) NULL,
    `openHours` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerBranch_partnerId_idx`(`partnerId`),
    UNIQUE INDEX `PartnerBranch_partnerId_name_key`(`partnerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehiclePartnerDocument` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewNote` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VehiclePartnerDocument_partnerId_status_idx`(`partnerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehicleCategory` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VehicleCategory_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehiclePhoto` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `caption` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `VehiclePhoto_vehicleId_idx`(`vehicleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehicleDocument` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `expiresAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VehicleDocument_vehicleId_status_idx`(`vehicleId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehicleBlock` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `bookingId` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VehicleBlock_vehicleId_startAt_endAt_idx`(`vehicleId`, `startAt`, `endAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RentalDetail` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_PARTNER', 'RESERVED', 'PAID', 'PICKED_UP', 'RETURNED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING_PARTNER',
    `rentalMode` ENUM('SELF_DRIVE', 'CHAUFFEUR') NOT NULL DEFAULT 'SELF_DRIVE',
    `ratePlan` VARCHAR(191) NOT NULL DEFAULT 'DAILY',
    `vehicleId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `dropoffBranchId` VARCHAR(191) NULL,
    `pickupAt` DATETIME(3) NOT NULL,
    `dropoffAt` DATETIME(3) NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 1,
    `pricePerDay` INTEGER NOT NULL,
    `addOns` JSON NULL,
    `insuranceType` VARCHAR(191) NULL,
    `fuelPolicy` VARCHAR(191) NULL,
    `depositAmount` INTEGER NOT NULL DEFAULT 0,
    `depositStatus` ENUM('PENDING', 'PAID', 'REFUNDED', 'FORFEITED') NOT NULL DEFAULT 'PENDING',
    `depositRefundedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `rejectedReason` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `pickedUpAt` DATETIME(3) NULL,
    `returnedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `lateFee` INTEGER NOT NULL DEFAULT 0,
    `mileageOut` INTEGER NULL,
    `mileageIn` INTEGER NULL,
    `fuelOut` VARCHAR(191) NULL,
    `fuelIn` VARCHAR(191) NULL,
    `driverLicenseNo` VARCHAR(191) NULL,
    `driverName` VARCHAR(191) NULL,
    `driverPhone` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RentalDetail_bookingId_key`(`bookingId`),
    INDEX `RentalDetail_status_pickupAt_idx`(`status`, `pickupAt`),
    INDEX `RentalDetail_vehicleId_pickupAt_dropoffAt_idx`(`vehicleId`, `pickupAt`, `dropoffAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `rentalId` VARCHAR(191) NOT NULL,
    `type` ENUM('DEPOSIT', 'RENTAL', 'ADDON', 'LATE_FEE', 'REFUND') NOT NULL,
    `method` ENUM('CASH', 'CARD', 'TRANSFER') NOT NULL,
    `amount` INTEGER NOT NULL,
    `baseAmount` INTEGER NOT NULL,
    `vatAmount` INTEGER NOT NULL DEFAULT 0,
    `receiptNo` VARCHAR(191) NULL,
    `receivedBy` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_rentalId_type_idx`(`rentalId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PartnerEarning` (
    `id` VARCHAR(191) NOT NULL,
    `rentalId` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `grossAmount` INTEGER NOT NULL,
    `commissionRate` INTEGER NOT NULL,
    `commission` INTEGER NOT NULL,
    `netAmount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PartnerEarning_rentalId_key`(`rentalId`),
    INDEX `PartnerEarning_partnerId_status_idx`(`partnerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommissionChangeLog` (
    `id` VARCHAR(191) NOT NULL,
    `partnerId` VARCHAR(191) NOT NULL,
    `oldRate` INTEGER NULL,
    `newRate` INTEGER NOT NULL,
    `changedBy` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionChangeLog_partnerId_idx`(`partnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PlatformSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Vehicle_partnerId_status_idx` ON `Vehicle`(`partnerId`, `status`);
CREATE INDEX `Vehicle_branchId_idx` ON `Vehicle`(`branchId`);
CREATE INDEX `Vehicle_categoryId_idx` ON `Vehicle`(`categoryId`);
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_partnerId_fkey` FOREIGN KEY (`partnerId`) REFERENCES `VehiclePartner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `PartnerBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `VehicleCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
