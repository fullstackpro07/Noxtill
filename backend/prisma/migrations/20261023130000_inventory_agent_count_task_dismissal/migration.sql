ALTER TABLE `inventory_agent_count_tasks`
  ADD COLUMN `dismissed_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `dismiss_reason` TEXT NULL,
  ADD COLUMN `dismissed_at` DATETIME(3) NULL;
