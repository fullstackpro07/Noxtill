ALTER TABLE `voice_ai_agent_test_runs`
  ADD COLUMN `expected_intent` VARCHAR(20) NULL,
  ADD COLUMN `actual_intent` VARCHAR(20) NULL;
