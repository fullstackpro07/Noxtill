-- AI outbound attempts pin eligibility evidence and an immutable AI version.
CREATE TABLE `voice_ai_outbound_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `campaign_id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  `version_id` VARCHAR(191) NOT NULL,
  `eligibility_decision_id` VARCHAR(191) NULL,
  `phone_call_id` VARCHAR(191) NULL,
  `call_sid` VARCHAR(34) NULL,
  `status` VARCHAR(20) NOT NULL,
  `provider_status` VARCHAR(40) NULL,
  `block_reason_code` VARCHAR(40) NULL,
  `duration_seconds` INTEGER NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `started_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_ai_outbound_phone_call_key` (`phone_call_id`),
  UNIQUE INDEX `voice_ai_outbound_call_sid_key` (`call_sid`),
  INDEX `voice_ai_outbound_campaign_idx` (`business_id`, `campaign_id`, `created_at`),
  INDEX `voice_ai_outbound_status_idx` (`business_id`, `status`, `created_at`),
  INDEX `voice_ai_outbound_member_idx` (`member_id`, `created_at`),
  INDEX `voice_ai_outbound_version_idx` (`version_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `voice_ai_outbound_business_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `voice_ai_outbound_campaign_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `voice_outbound_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `voice_ai_outbound_member_fkey` FOREIGN KEY (`member_id`) REFERENCES `voice_outbound_campaign_members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `voice_ai_outbound_version_fkey` FOREIGN KEY (`version_id`) REFERENCES `voice_ai_agent_versions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `voice_ai_outbound_decision_fkey` FOREIGN KEY (`eligibility_decision_id`) REFERENCES `voice_outbound_eligibility_decisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `voice_ai_outbound_phone_call_fkey` FOREIGN KEY (`phone_call_id`) REFERENCES `phone_calls` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A Twilio QueueTime is retained as measured evidence; active waiting calls remain separately queryable.
CREATE TABLE `voice_call_queue_entries` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `call_id` VARCHAR(191) NOT NULL,
  `queue_name` VARCHAR(64) NOT NULL,
  `provider_queue_sid` VARCHAR(34) NULL,
  `status` VARCHAR(20) NOT NULL,
  `entered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `exited_at` DATETIME(3) NULL,
  `wait_seconds` INTEGER NULL,
  `overflow_action` VARCHAR(20) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_call_queue_call_key` (`call_id`),
  INDEX `voice_call_queue_business_status_idx` (`business_id`, `status`, `entered_at`),
  INDEX `voice_call_queue_business_exit_idx` (`business_id`, `exited_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `voice_call_queue_business_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `voice_call_queue_call_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_call_queue_configs` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `queue_name` VARCHAR(64) NOT NULL,
  `sla_target_seconds` INTEGER NULL,
  `updated_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_call_queue_config_business_name_key` (`business_id`, `queue_name`),
  INDEX `voice_call_queue_config_business_idx` (`business_id`, `queue_name`),
  PRIMARY KEY (`id`),
  CONSTRAINT `voice_call_queue_config_business_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `phone_calls`
  ADD COLUMN `direction` VARCHAR(12) NOT NULL DEFAULT 'inbound';

ALTER TABLE `ai_call_logs`
  ADD COLUMN `voice_agent_version_id` VARCHAR(191) NULL,
  ADD INDEX `ai_call_logs_voice_version_idx` (`business_id`, `voice_agent_version_id`, `created_at`);
