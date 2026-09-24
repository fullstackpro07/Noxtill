-- AlterTable
ALTER TABLE `phone_calls` ADD COLUMN `assigned_to_user_id` VARCHAR(191) NULL,
    ADD COLUMN `summary` TEXT NULL,
    ADD COLUMN `summary_generated_at` DATETIME(3) NULL;
