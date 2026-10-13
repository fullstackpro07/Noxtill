-- Guest invite email delivery evidence. Set only after the email provider accepted the message;
-- a null value means the organizer shares the link manually.
ALTER TABLE `voice_meeting_invites`
  ADD COLUMN `email_sent_at` DATETIME(3) NULL,
  ADD COLUMN `email_provider_ref` VARCHAR(191) NULL;
