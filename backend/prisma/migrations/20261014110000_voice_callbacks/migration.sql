-- Missed-call recovery: compliant call-backs with per-attempt evidence.
CREATE TABLE `voice_callbacks` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `phone_call_id` VARCHAR(191) NOT NULL,
  `phone_e164` VARCHAR(16) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'open',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `last_attempt_at` DATETIME(3) NULL,
  `last_block_reason` VARCHAR(40) NULL,
  `outcome` VARCHAR(40) NULL,
  `outcome_notes` VARCHAR(1000) NULL,
  `completed_at` DATETIME(3) NULL,
  `completed_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `voice_callbacks_phone_call_id_key`(`phone_call_id`),
  INDEX `voice_callback_status_idx`(`business_id`, `status`, `updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_callback_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `callback_id` VARCHAR(191) NOT NULL,
  `agent_profile_id` VARCHAR(191) NULL,
  `eligibility_decision_id` VARCHAR(191) NULL,
  `status` ENUM('blocked', 'agent_ringing', 'agent_no_answer', 'customer_ringing', 'answered', 'busy', 'no_answer', 'failed', 'canceled') NOT NULL,
  `block_reason_code` VARCHAR(40) NULL,
  `agent_call_sid` VARCHAR(64) NULL,
  `customer_dialed` BOOLEAN NOT NULL DEFAULT false,
  `duration_sec` INTEGER NULL,
  `placed_by_user_id` VARCHAR(191) NOT NULL,
  `answered_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `voice_callback_attempts_agent_call_sid_key`(`agent_call_sid`),
  INDEX `voice_callback_attempt_idx`(`business_id`, `callback_id`, `created_at`),
  INDEX `voice_callback_attempt_agent_idx`(`business_id`, `agent_profile_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_callbacks`
  ADD CONSTRAINT `voice_callbacks_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_callbacks_phone_call_id_fkey` FOREIGN KEY (`phone_call_id`) REFERENCES `phone_calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `voice_callback_attempts`
  ADD CONSTRAINT `voice_callback_attempts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_callback_attempts_callback_id_fkey` FOREIGN KEY (`callback_id`) REFERENCES `voice_callbacks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_callback_attempts_agent_profile_id_fkey` FOREIGN KEY (`agent_profile_id`) REFERENCES `voice_human_agent_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
