CREATE TABLE `specialist_agent_ai_requests` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `run_id` VARCHAR(191) NULL,
  `agent_key` VARCHAR(64) NOT NULL,
  `state` VARCHAR(24) NOT NULL DEFAULT 'reserved',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `specialist_agent_ai_requests_month_idx` (`business_id`, `agent_key`, `created_at`),
  INDEX `specialist_agent_ai_requests_run_idx` (`run_id`, `created_at`),
  CONSTRAINT `specialist_agent_ai_requests_business_fk`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `specialist_agent_ai_requests_run_fk`
    FOREIGN KEY (`run_id`) REFERENCES `specialist_agent_runs` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
