-- รูปโปรไฟล์จากผู้ให้บริการภายนอก (Google)
-- เก็บเป็น URL เท่านั้น ตัวไฟล์อยู่บนเซิร์ฟเวอร์ของผู้ให้บริการ
--   npx prisma db execute --file prisma/user_avatar.sql

ALTER TABLE `User` ADD COLUMN `avatarUrl` VARCHAR(512) NULL;
