-- Record the published policy and explicit caller choice required before saving call audio.
ALTER TABLE `phone_calls`
  ADD COLUMN `recording_consent_at` DATETIME(3) NULL,
  ADD COLUMN `recording_consent_status` ENUM('not_configured', 'not_allowed', 'pending', 'granted', 'declined', 'no_response') NOT NULL DEFAULT 'not_configured',
  ADD COLUMN `recording_expires_at` DATETIME(3) NULL,
  ADD COLUMN `recording_notice_snapshot` TEXT NULL,
  ADD COLUMN `recording_policy_version_id` VARCHAR(191) NULL,
  ADD COLUMN `recording_retention_days` INTEGER NULL,
  ADD INDEX `phone_calls_recording_expires_idx` (`recording_expires_at`),
  ADD INDEX `phone_calls_recording_policy_idx` (`recording_policy_version_id`),
  ADD CONSTRAINT `phone_calls_recording_policy_version_id_fkey`
    FOREIGN KEY (`recording_policy_version_id`) REFERENCES `voice_compliance_policy_versions` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
