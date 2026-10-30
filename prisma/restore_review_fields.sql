-- Columns referenced by the admin review flow and the "my listings" screens.
-- Applied with: npx prisma db execute --file prisma/restore_review_fields.sql

ALTER TABLE `Stay`
  ADD COLUMN `reviewedBy` VARCHAR(191) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectedReason` VARCHAR(191) NULL;

ALTER TABLE `Vehicle`
  ADD COLUMN `rejectedReason` VARCHAR(191) NULL;
