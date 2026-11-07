ALTER TABLE `phone_calls`
  ADD COLUMN `provider_status_checked_at` DATETIME(3) NULL;

CREATE INDEX `phone_calls_status_provider_check_idx`
  ON `phone_calls` (`status`, `provider_status_checked_at`, `started_at`);
