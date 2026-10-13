-- Legal hold on call recordings/transcripts: blocks manual deletion and retention purge.
ALTER TABLE `phone_calls`
  ADD COLUMN `legal_hold_at` DATETIME(3) NULL,
  ADD COLUMN `legal_hold_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `legal_hold_reason` VARCHAR(500) NULL;
