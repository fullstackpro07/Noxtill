CREATE TABLE `workflow_run_attempts` (
  `id` VARCHAR(191) NOT NULL,
  `workflow_run_id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `attempt_number` INTEGER NOT NULL,
  `status` ENUM('running', 'success', 'failed', 'skipped') NOT NULL,
  `result` JSON NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `workflow_run_attempts_run_attempt_key` (`workflow_run_id`, `attempt_number`),
  INDEX `workflow_run_attempts_business_run_started_idx` (`business_id`, `workflow_run_id`, `started_at`),
  CONSTRAINT `workflow_run_attempts_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_run_attempts_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
