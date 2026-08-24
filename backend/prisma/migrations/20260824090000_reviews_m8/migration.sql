ALTER TABLE `review_requests`
  ADD COLUMN `status` ENUM('sent', 'opened', 'rated') NOT NULL DEFAULT 'sent',
  ADD COLUMN `opened_at` DATETIME(3) NULL;

ALTER TABLE `businesses`
  ADD COLUMN `review_settings` JSON NOT NULL DEFAULT ('{}');
