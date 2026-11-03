CREATE TABLE `voice_ai_agents` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `template` VARCHAR(40) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `current_draft_version_id` VARCHAR(191) NULL,
  `published_version_id` VARCHAR(191) NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_ai_agents_business_name_key` (`business_id`, `name`),
  INDEX `voice_ai_agents_business_status_idx` (`business_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_ai_agent_versions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `agent_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `config` JSON NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `voice_ai_agent_versions_agent_version_key` (`agent_id`, `version`),
  INDEX `voice_ai_agent_versions_business_agent_idx` (`business_id`, `agent_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_ai_agent_test_runs` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `version_id` VARCHAR(191) NOT NULL,
  `scenario` TEXT NOT NULL,
  `response` TEXT NULL,
  `passed` BOOLEAN NOT NULL,
  `error_code` VARCHAR(80) NULL,
  `error_message` VARCHAR(500) NULL,
  `input_tokens` INTEGER NOT NULL DEFAULT 0,
  `output_tokens` INTEGER NOT NULL DEFAULT 0,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `voice_ai_agent_test_runs_business_version_idx` (`business_id`, `version_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_ai_agents`
  ADD CONSTRAINT `voice_ai_agents_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_ai_agent_versions`
  ADD CONSTRAINT `voice_ai_agent_versions_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_ai_agent_versions_agent_id_fkey`
  FOREIGN KEY (`agent_id`) REFERENCES `voice_ai_agents` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_ai_agent_test_runs`
  ADD CONSTRAINT `voice_ai_agent_test_runs_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_ai_agent_test_runs_version_id_fkey`
  FOREIGN KEY (`version_id`) REFERENCES `voice_ai_agent_versions` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `phone_calls`
  ADD COLUMN `voice_agent_version_id` VARCHAR(191) NULL,
  ADD INDEX `phone_calls_business_agent_version_idx` (`business_id`, `voice_agent_version_id`),
  ADD CONSTRAINT `phone_calls_voice_agent_version_id_fkey`
  FOREIGN KEY (`voice_agent_version_id`) REFERENCES `voice_ai_agent_versions` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
