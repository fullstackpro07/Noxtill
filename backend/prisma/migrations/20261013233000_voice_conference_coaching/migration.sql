ALTER TABLE `voice_human_agent_assignments`
  ADD COLUMN `provider_call_sid` VARCHAR(34) NULL,
  ADD COLUMN `conference_sid` VARCHAR(34) NULL;
