-- Power dialer execution: per-attempt evidence, contact attempt counters and campaign run times.
ALTER TABLE `voice_outbound_campaigns`
  ADD COLUMN `started_at` DATETIME(3) NULL,
  ADD COLUMN `started_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `paused_at` DATETIME(3) NULL,
  ADD COLUMN `stopped_at` DATETIME(3) NULL;

ALTER TABLE `voice_outbound_campaign_members`
  ADD COLUMN `attempt_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `last_attempt_at` DATETIME(3) NULL,
  ADD COLUMN `disposition` VARCHAR(40) NULL;

CREATE TABLE `voice_outbound_dial_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `campaign_id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  `agent_profile_id` VARCHAR(191) NOT NULL,
  `eligibility_decision_id` VARCHAR(191) NULL,
  `status` ENUM('blocked', 'agent_ringing', 'agent_no_answer', 'customer_ringing', 'answered', 'busy', 'no_answer', 'failed', 'canceled') NOT NULL,
  `block_reason_code` VARCHAR(40) NULL,
  `agent_call_sid` VARCHAR(64) NULL,
  `customer_dialed` BOOLEAN NOT NULL DEFAULT false,
  `duration_sec` INTEGER NULL,
  `disposition` VARCHAR(40) NULL,
  `disposition_notes` VARCHAR(1000) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `answered_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `voice_outbound_dial_attempts_agent_call_sid_key`(`agent_call_sid`),
  INDEX `voice_dial_attempt_campaign_idx`(`business_id`, `campaign_id`, `created_at`),
  INDEX `voice_dial_attempt_agent_idx`(`business_id`, `agent_profile_id`, `status`),
  INDEX `voice_dial_attempt_member_idx`(`member_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_outbound_dial_attempts`
  ADD CONSTRAINT `voice_outbound_dial_attempts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_outbound_dial_attempts_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `voice_outbound_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_outbound_dial_attempts_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `voice_outbound_campaign_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_outbound_dial_attempts_agent_profile_id_fkey` FOREIGN KEY (`agent_profile_id`) REFERENCES `voice_human_agent_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
