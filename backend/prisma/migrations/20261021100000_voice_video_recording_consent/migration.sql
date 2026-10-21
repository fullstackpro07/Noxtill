ALTER TABLE `voice_video_meetings`
  ADD COLUMN `recording_policy_version_id` VARCHAR(191) NULL;

CREATE TABLE `voice_video_recordings` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `meeting_id` VARCHAR(191) NOT NULL,
  `policy_version_id` VARCHAR(191) NOT NULL,
  `started_by_user_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'consent_pending',
  `notice_snapshot` TEXT NOT NULL,
  `notice_hash` CHAR(64) NOT NULL,
  `region_code` CHAR(2) NOT NULL,
  `retention_days` INTEGER NOT NULL,
  `retention_expires_at` DATETIME(3) NOT NULL,
  `storage_key` VARCHAR(500) NULL,
  `egress_id` VARCHAR(191) NULL,
  `provider_started_at` DATETIME(3) NULL,
  `stop_requested_at` DATETIME(3) NULL,
  `provider_ended_at` DATETIME(3) NULL,
  `finalized_at` DATETIME(3) NULL,
  `duration_seconds` BIGINT NULL,
  `size_bytes` BIGINT NULL,
  `failure_code` VARCHAR(80) NULL,
  `failure_message` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_video_recordings_egress_id_key`(`egress_id`),
  INDEX `voice_video_recordings_meeting_status_idx`(`business_id`, `meeting_id`, `status`, `created_at`),
  INDEX `voice_video_recordings_retention_idx`(`business_id`, `status`, `retention_expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_video_recording_consents` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `recording_id` VARCHAR(191) NOT NULL,
  `participant_id` VARCHAR(191) NULL,
  `identity` VARCHAR(191) NOT NULL,
  `role` VARCHAR(10) NOT NULL,
  `decision` VARCHAR(12) NOT NULL,
  `notice_snapshot` TEXT NOT NULL,
  `notice_hash` CHAR(64) NOT NULL,
  `source` VARCHAR(24) NOT NULL,
  `decided_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `voice_video_recording_consents_decision_idx`(`business_id`, `recording_id`, `decision`),
  UNIQUE INDEX `voice_video_recording_consents_recording_identity_key`(`recording_id`, `identity`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_video_meetings`
  ADD CONSTRAINT `voice_video_meetings_recording_policy_version_id_fkey`
  FOREIGN KEY (`recording_policy_version_id`) REFERENCES `voice_compliance_policy_versions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `voice_video_recordings`
  ADD CONSTRAINT `voice_video_recordings_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_video_recordings`
  ADD CONSTRAINT `voice_video_recordings_meeting_id_fkey`
  FOREIGN KEY (`meeting_id`) REFERENCES `voice_video_meetings`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `voice_video_recordings`
  ADD CONSTRAINT `voice_video_recordings_policy_version_id_fkey`
  FOREIGN KEY (`policy_version_id`) REFERENCES `voice_compliance_policy_versions`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_video_recording_consents`
  ADD CONSTRAINT `voice_video_recording_consents_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_video_recording_consents`
  ADD CONSTRAINT `voice_video_recording_consents_recording_id_fkey`
  FOREIGN KEY (`recording_id`) REFERENCES `voice_video_recordings`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `voice_video_recording_consents`
  ADD CONSTRAINT `voice_video_recording_consents_participant_id_fkey`
  FOREIGN KEY (`participant_id`) REFERENCES `voice_meeting_participants`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
