-- Outbound campaign planning and per-contact eligibility evidence only.
-- This migration adds no provider job, dial attempt, or customer-call behavior.
CREATE TABLE `voice_outbound_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `caller_type` ENUM('ai_voice', 'live_agent', 'prerecorded') NOT NULL,
    `country_code` CHAR(2) NOT NULL,
    `time_zone` VARCHAR(100) NOT NULL,
    `opening_script` TEXT NOT NULL,
    `status` ENUM('draft', 'pending_approval', 'approved', 'scheduled', 'running', 'paused', 'stop_requested', 'stopped', 'completed') NOT NULL DEFAULT 'draft',
    `ai_agent_id` VARCHAR(191) NULL,
    `human_agent_profile_id` VARCHAR(191) NULL,
    `scheduled_at` DATETIME(3) NULL,
    `max_attempts_per_contact` INTEGER NOT NULL DEFAULT 1,
    `retry_cooldown_hours` INTEGER NOT NULL DEFAULT 24,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `eligibility_checked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_outbound_campaign_status_idx`(`business_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_outbound_campaign_members` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `status` ENUM('selected', 'eligible', 'blocked', 'queued', 'calling', 'answered', 'busy', 'no_answer', 'voicemail', 'retry', 'opted_out', 'skipped', 'completed') NOT NULL DEFAULT 'selected',
    `block_reason_code` VARCHAR(40) NULL,
    `eligibility_decision_id` VARCHAR(191) NULL,
    `eligibility_checked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `voice_outbound_campaign_member_key`(`campaign_id`, `customer_id`),
    INDEX `voice_outbound_member_status_idx`(`business_id`, `campaign_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_outbound_campaigns` ADD CONSTRAINT `voice_outbound_campaigns_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaigns` ADD CONSTRAINT `voice_outbound_campaigns_ai_agent_id_fkey` FOREIGN KEY (`ai_agent_id`) REFERENCES `voice_ai_agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaigns` ADD CONSTRAINT `voice_outbound_campaigns_human_agent_profile_id_fkey` FOREIGN KEY (`human_agent_profile_id`) REFERENCES `voice_human_agent_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaign_members` ADD CONSTRAINT `voice_outbound_campaign_members_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaign_members` ADD CONSTRAINT `voice_outbound_campaign_members_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `voice_outbound_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaign_members` ADD CONSTRAINT `voice_outbound_campaign_members_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_campaign_members` ADD CONSTRAINT `voice_outbound_campaign_members_eligibility_decision_id_fkey` FOREIGN KEY (`eligibility_decision_id`) REFERENCES `voice_outbound_eligibility_decisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
