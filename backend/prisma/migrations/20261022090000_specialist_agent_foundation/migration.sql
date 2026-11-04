CREATE TABLE `specialist_agent_runs` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `agent_key` VARCHAR(64) NOT NULL,
  `agent_version` VARCHAR(32) NOT NULL,
  `module_id` VARCHAR(16) NOT NULL,
  `trigger_type` VARCHAR(24) NOT NULL DEFAULT 'manual',
  `status` VARCHAR(20) NOT NULL,
  `initiated_by_user_id` VARCHAR(191) NULL,
  `input_refs` JSON NOT NULL,
  `output` JSON NOT NULL,
  `policy_result` JSON NOT NULL,
  `error_code` VARCHAR(64) NULL,
  `error_message` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `specialist_agent_runs_business_agent_created_idx` (`business_id`, `agent_key`, `created_at`),
  INDEX `specialist_agent_runs_business_status_created_idx` (`business_id`, `status`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_runs_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `specialist_agent_recommendations` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `run_id` VARCHAR(191) NOT NULL,
  `agent_key` VARCHAR(64) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `summary` TEXT NOT NULL,
  `classification` VARCHAR(24) NOT NULL,
  `details` JSON NOT NULL,
  `assumptions` JSON NOT NULL,
  `missing_data` JSON NOT NULL,
  `confidence_value` DOUBLE NULL,
  `confidence_method` VARCHAR(32) NOT NULL,
  `risk_tier` VARCHAR(16) NOT NULL,
  `approval_required` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(20) NOT NULL DEFAULT 'proposed',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `specialist_agent_recommendations_business_run_status_idx` (`business_id`, `run_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_recommendations_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_recommendations_run_id_fkey`
    FOREIGN KEY (`run_id`) REFERENCES `specialist_agent_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `specialist_agent_evidence` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `run_id` VARCHAR(191) NOT NULL,
  `recommendation_id` VARCHAR(191) NULL,
  `source_type` VARCHAR(40) NOT NULL,
  `resource_type` VARCHAR(40) NOT NULL,
  `resource_id` VARCHAR(191) NOT NULL,
  `field_refs` JSON NOT NULL,
  `observed_values` JSON NOT NULL,
  `observed_at` DATETIME(3) NOT NULL,
  `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `freshness` VARCHAR(16) NOT NULL,
  `calculation` TEXT NULL,
  INDEX `specialist_agent_evidence_business_run_idx` (`business_id`, `run_id`),
  INDEX `specialist_agent_evidence_resource_idx` (`business_id`, `resource_type`, `resource_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_evidence_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_evidence_run_id_fkey`
    FOREIGN KEY (`run_id`) REFERENCES `specialist_agent_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_evidence_recommendation_id_fkey`
    FOREIGN KEY (`recommendation_id`) REFERENCES `specialist_agent_recommendations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
