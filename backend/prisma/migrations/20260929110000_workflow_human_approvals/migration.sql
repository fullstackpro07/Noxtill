CREATE TABLE `workflow_approvals` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `workflow_id` VARCHAR(191) NOT NULL,
  `workflow_run_id` VARCHAR(191) NOT NULL,
  `action_index` INTEGER NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `payload` JSON NOT NULL,
  `payload_hash` CHAR(64) NOT NULL,
  `decided_by_user_id` VARCHAR(191) NULL,
  `decision_comment` TEXT NULL,
  `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `decided_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `workflow_approvals_run_action_key` (`workflow_run_id`, `action_index`),
  INDEX `workflow_approvals_business_status_requested_idx` (`business_id`, `status`, `requested_at`),
  INDEX `workflow_approvals_workflow_id_requested_at_idx` (`workflow_id`, `requested_at`),
  CONSTRAINT `workflow_approvals_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_approvals_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_approvals_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_approvals_decided_by_user_id_fkey`
    FOREIGN KEY (`decided_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
