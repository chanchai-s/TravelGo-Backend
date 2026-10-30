-- Restore fields the application code (and frontend) expects but the database lost:
--   Stay.draftKey           (Agoda-style draft key for ownerless draft listings)
--   WholePropertyDetail     (whole house / villa onboarding details)
--   UserPost.likes          (stored like counter used by /posts)
-- Applied with: npx prisma db execute --file prisma/restore_missing_fields.sql

ALTER TABLE `Stay` ADD COLUMN `draftKey` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Stay_draftKey_key` ON `Stay`(`draftKey`);

ALTER TABLE `UserPost` ADD COLUMN `likes` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `WholePropertyDetail` (
    `id` VARCHAR(191) NOT NULL,
    `stayId` VARCHAR(191) NOT NULL,
    `bedroomsCount` INTEGER NULL,
    `bathroomsCount` INTEGER NULL,
    `maxCapacity` INTEGER NULL,
    `unitNo` VARCHAR(191) NULL,
    `hostLivesIn` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `WholePropertyDetail_stayId_key`(`stayId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WholePropertyDetail` ADD CONSTRAINT `WholePropertyDetail_stayId_fkey` FOREIGN KEY (`stayId`) REFERENCES `Stay`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
