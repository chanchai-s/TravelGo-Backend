-- Ride & Logistics schema (R0)
-- Applied manually because prisma db push fails on pre-existing FK index drift
--   npx prisma db execute --file prisma/ride_schema.sql
--   npx prisma db execute --file prisma/ride_fk.sql

ALTER TABLE `User` ADD COLUMN `password` VARCHAR(191) NULL;

ALTER TABLE `DriverProfile`
    ADD COLUMN `serviceTypes` JSON NULL,
    ADD COLUMN `tierCodes` JSON NULL,
    ADD COLUMN `isOnline` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lastLat` DOUBLE NULL,
    ADD COLUMN `lastLng` DOUBLE NULL,
    ADD COLUMN `lastLocationAt` DATETIME(3) NULL,
    ADD COLUMN `rating` DOUBLE NOT NULL DEFAULT 5,
    ADD COLUMN `totalTrips` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `commissionRate` INTEGER NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL,
    ADD COLUMN `rejectedReason` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `RideTier` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `serviceType` ENUM('RIDE', 'PARCEL', 'LOGISTICS') NOT NULL,
    `vehicleType` ENUM('MOTORCYCLE', 'CAR', 'SUV', 'VAN', 'PICKUP', 'TRUCK_6W', 'TRUCK_10W', 'TRAILER', 'REFRIGERATED') NOT NULL,
    `seats` INTEGER NULL,
    `maxWeightKg` INTEGER NULL,
    `maxDimCm` VARCHAR(191) NULL,
    `baseFare` INTEGER NOT NULL DEFAULT 0,
    `perKm` INTEGER NOT NULL DEFAULT 0,
    `perMin` INTEGER NOT NULL DEFAULT 0,
    `minFare` INTEGER NOT NULL DEFAULT 0,
    `flatFare` INTEGER NULL,
    `includedKm` INTEGER NULL,
    `description` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RideTier_code_key`(`code`),
    INDEX `RideTier_serviceType_isActive_sortOrder_idx`(`serviceType`, `isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DriverVehicle` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('MOTORCYCLE', 'CAR', 'SUV', 'VAN', 'PICKUP', 'TRUCK_6W', 'TRUCK_10W', 'TRAILER', 'REFRIGERATED') NOT NULL,
    `tierCode` VARCHAR(191) NULL,
    `brand` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `plateNo` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `seats` INTEGER NULL,
    `maxWeightKg` INTEGER NULL,
    `photoUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriverVehicle_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DriverDocument` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ID_CARD', 'LICENSE', 'BLUE_BOOK', 'INSURANCE', 'CRIMINAL_CHECK', 'PASSBOOK') NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewNote` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriverDocument_userId_type_idx`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SavedAddress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedAddress_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideJob` (
    `id` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `serviceType` ENUM('RIDE', 'PARCEL', 'LOGISTICS') NOT NULL,
    `tierCode` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'REQUESTED',
    `passengerCount` INTEGER NULL,
    `pickupLat` DOUBLE NOT NULL,
    `pickupLng` DOUBLE NOT NULL,
    `pickupAddress` VARCHAR(191) NOT NULL,
    `dropoffLat` DOUBLE NOT NULL,
    `dropoffLng` DOUBLE NOT NULL,
    `dropoffAddress` VARCHAR(191) NOT NULL,
    `distanceKm` DOUBLE NOT NULL DEFAULT 0,
    `durationMin` INTEGER NOT NULL DEFAULT 0,
    `baseFare` INTEGER NOT NULL DEFAULT 0,
    `addonTotal` INTEGER NOT NULL DEFAULT 0,
    `vatAmount` INTEGER NOT NULL DEFAULT 0,
    `fareEstimate` INTEGER NOT NULL DEFAULT 0,
    `fareFinal` INTEGER NULL,
    `commissionRate` INTEGER NULL,
    `commission` INTEGER NOT NULL DEFAULT 0,
    `netToDriver` INTEGER NOT NULL DEFAULT 0,
    `paymentTiming` ENUM('PREPAY', 'POSTPAY') NOT NULL,
    `paymentMethod` ENUM('CARD', 'PROMPTPAY', 'WALLET', 'CASH', 'TRANSFER') NOT NULL,
    `paymentStatus` ENUM('PENDING', 'AUTHORIZED', 'PAID', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(191) NULL,
    `cancelBy` VARCHAR(191) NULL,

    UNIQUE INDEX `RideJob_ref_key`(`ref`),
    INDEX `RideJob_serviceType_status_requestedAt_idx`(`serviceType`, `status`, `requestedAt`),
    INDEX `RideJob_driverId_status_idx`(`driverId`, `status`),
    INDEX `RideJob_riderId_requestedAt_idx`(`riderId`, `requestedAt`),
    INDEX `RideJob_tierCode_idx`(`tierCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideAddon` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `type` ENUM('INSURANCE', 'CHILD_SEAT', 'VIP_ESCORT', 'EXTRA_STOP', 'LOADING', 'WAITING') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,

    INDEX `RideAddon_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ParcelDetail` (
    `jobId` VARCHAR(191) NOT NULL,
    `weightKg` DOUBLE NOT NULL,
    `sizeTier` ENUM('S', 'M', 'L', 'XL') NOT NULL,
    `isFragile` BOOLEAN NOT NULL DEFAULT false,
    `receiverName` VARCHAR(191) NOT NULL,
    `receiverPhone` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `pickupOtp` VARCHAR(191) NULL,
    `deliveryOtp` VARCHAR(191) NULL,
    `proofPhotoUrl` VARCHAR(191) NULL,
    `signatureUrl` VARCHAR(191) NULL,
    `codAmount` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`jobId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideStatusLog` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED') NULL,
    `toStatus` ENUM('REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED') NOT NULL,
    `byUserId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RideStatusLog_jobId_createdAt_idx`(`jobId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DriverLocation` (
    `id` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `bearing` DOUBLE NULL,
    `speed` DOUBLE NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DriverLocation_jobId_recordedAt_idx`(`jobId`, `recordedAt`),
    INDEX `DriverLocation_driverId_recordedAt_idx`(`driverId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RidePayment` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `timing` ENUM('PREPAY', 'POSTPAY') NOT NULL,
    `method` ENUM('CARD', 'PROMPTPAY', 'WALLET', 'CASH', 'TRANSFER') NOT NULL,
    `status` ENUM('PENDING', 'AUTHORIZED', 'PAID', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `type` VARCHAR(191) NOT NULL DEFAULT 'FARE',
    `amount` INTEGER NOT NULL,
    `baseAmount` INTEGER NOT NULL DEFAULT 0,
    `vatAmount` INTEGER NOT NULL DEFAULT 0,
    `gatewayRef` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RidePayment_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DriverEarning` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `gross` INTEGER NOT NULL,
    `commission` INTEGER NOT NULL,
    `net` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DriverEarning_jobId_key`(`jobId`),
    INDEX `DriverEarning_driverId_status_idx`(`driverId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideRating` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `stars` INTEGER NOT NULL,
    `text` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RideRating_jobId_key`(`jobId`),
    INDEX `RideRating_driverId_idx`(`driverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideMessage` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `text` VARCHAR(191) NULL,
    `attachmentUrl` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RideMessage_jobId_createdAt_idx`(`jobId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RideSosEvent` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `note` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'ACK', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `handledBy` VARCHAR(191) NULL,
    `handledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RideSosEvent_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

