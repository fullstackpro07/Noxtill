ALTER TABLE `voice_human_agent_assignments`
  ADD COLUMN `pending_action` VARCHAR(24) NULL,
  ADD COLUMN `provider_dispatch_state` VARCHAR(20) NULL,
  ADD COLUMN `provider_dispatch_started_at` DATETIME(3) NULL;
