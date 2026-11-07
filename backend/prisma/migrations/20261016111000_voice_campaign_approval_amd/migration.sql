-- Outbound campaigns: approval step, voicemail detection; dial attempts record the AMD result.
ALTER TABLE `voice_outbound_campaigns`
  ADD COLUMN `approval_requested_at` DATETIME(3) NULL,
  ADD COLUMN `approval_requested_by` VARCHAR(191) NULL,
  ADD COLUMN `approved_at` DATETIME(3) NULL,
  ADD COLUMN `approved_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `voicemail_detection` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `voice_outbound_dial_attempts`
  ADD COLUMN `answered_by` VARCHAR(30) NULL,
  MODIFY `status` ENUM('blocked', 'agent_ringing', 'agent_no_answer', 'customer_ringing', 'answered', 'voicemail', 'busy', 'no_answer', 'failed', 'canceled') NOT NULL;

ALTER TABLE `voice_callback_attempts`
  MODIFY `status` ENUM('blocked', 'agent_ringing', 'agent_no_answer', 'customer_ringing', 'answered', 'voicemail', 'busy', 'no_answer', 'failed', 'canceled') NOT NULL;
