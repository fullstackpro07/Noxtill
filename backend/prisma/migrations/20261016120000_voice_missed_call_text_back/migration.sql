-- Missed-call text-back evidence: outcome and the send-gate Message it created.
ALTER TABLE `phone_calls`
  ADD COLUMN `text_back_status` VARCHAR(30) NULL,
  ADD COLUMN `text_back_message_id` VARCHAR(191) NULL;
