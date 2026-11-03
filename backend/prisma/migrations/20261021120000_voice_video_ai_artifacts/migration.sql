ALTER TABLE `voice_compliance_policy_versions`
  ADD COLUMN `meeting_ai_processing_allowed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `meeting_ai_processing_notice_text` TEXT NULL;

ALTER TABLE `voice_video_recordings`
  ADD COLUMN `ai_processing_allowed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `ai_processing_notice_snapshot` TEXT NULL,
  ADD COLUMN `artifact_status` VARCHAR(24) NOT NULL DEFAULT 'not_requested',
  ADD COLUMN `transcript_text` LONGTEXT NULL,
  ADD COLUMN `generated_summary` TEXT NULL,
  ADD COLUMN `follow_up_draft` TEXT NULL,
  ADD COLUMN `artifacts_generated_at` DATETIME(3) NULL,
  ADD COLUMN `artifact_failure_message` VARCHAR(500) NULL;

ALTER TABLE `message_drafts`
  ADD COLUMN `source_meeting_id` VARCHAR(191) NULL,
  ADD INDEX `message_drafts_business_meeting_status_idx` (`business_id`, `source_meeting_id`, `status`),
  ADD CONSTRAINT `message_drafts_source_meeting_id_fkey`
    FOREIGN KEY (`source_meeting_id`) REFERENCES `voice_video_meetings` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
