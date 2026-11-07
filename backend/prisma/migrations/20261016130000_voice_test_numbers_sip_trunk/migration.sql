-- Test caller numbers and a verified SIP trunk on voice settings; calls remember test status.
ALTER TABLE `voice_settings`
  ADD COLUMN `test_caller_numbers` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN `sip_trunk_sid` VARCHAR(34) NULL;

ALTER TABLE `phone_calls`
  ADD COLUMN `is_test_call` BOOLEAN NOT NULL DEFAULT false;
