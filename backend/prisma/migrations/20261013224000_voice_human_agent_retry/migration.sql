ALTER TABLE `voice_human_agent_assignments`
    DROP INDEX `voice_human_agent_assignments_call_id_key`,
    ADD INDEX `voice_agent_assignments_call_id_idx` (`call_id`),
    ADD COLUMN `attempt_number` INTEGER NOT NULL DEFAULT 1,
    ADD UNIQUE INDEX `voice_agent_assignments_business_call_attempt_key`
        (`business_id`, `call_id`, `attempt_number`);
