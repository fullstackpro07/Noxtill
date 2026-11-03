ALTER TABLE `voice_ai_agent_versions`
  ADD COLUMN `approved_at` DATETIME(3) NULL,
  ADD COLUMN `approved_by_user_id` VARCHAR(191) NULL;
