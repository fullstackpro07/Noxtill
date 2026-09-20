-- Staff module v2 — real category label and recorded-by attribution on advances.
ALTER TABLE `staff_advances` ADD COLUMN `category` VARCHAR(191) NULL;
ALTER TABLE `staff_advances` ADD COLUMN `recorded_by_user_id` VARCHAR(191) NULL;
