ALTER TABLE `phone_calls`
  ADD COLUMN `quota_rejected_at` DATETIME(3) NULL,
  ADD COLUMN `quota_rejected_reason` TEXT NULL;
