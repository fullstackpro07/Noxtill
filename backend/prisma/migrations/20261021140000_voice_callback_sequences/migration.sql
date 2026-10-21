ALTER TABLE `phone_calls`
  ADD COLUMN `status_sequence_number` INTEGER NULL;

ALTER TABLE `voice_call_transfers`
  ADD COLUMN `provider_status_sequence` INTEGER NULL;
