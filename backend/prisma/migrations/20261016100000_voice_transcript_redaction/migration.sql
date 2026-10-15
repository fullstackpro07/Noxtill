-- Post-call transcript redaction marker and match count.
ALTER TABLE `phone_calls`
  ADD COLUMN `transcript_redacted_at` DATETIME(3) NULL,
  ADD COLUMN `transcript_redaction_count` INTEGER NULL;
