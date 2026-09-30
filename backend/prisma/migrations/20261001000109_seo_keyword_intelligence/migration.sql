ALTER TABLE `tracked_keywords`
  ADD COLUMN `intent` VARCHAR(24) NULL,
  ADD COLUMN `target_page_url` VARCHAR(2048) NULL;
