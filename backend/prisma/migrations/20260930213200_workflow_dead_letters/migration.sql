CREATE TABLE `workflow_dead_letters` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `workflow_id` VARCHAR(191) NOT NULL,
  `workflow_run_id` VARCHAR(191) NOT NULL,
  `owner_user_id` VARCHAR(191) NULL,
  `owner_role` ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'owner',
  `status` ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  `next_action` ENUM('retry', 'manual_review') NOT NULL DEFAULT 'manual_review',
  `failure_code` VARCHAR(64) NOT NULL,
  `evidence` JSON NOT NULL,
  `operator_retry_count` INTEGER NOT NULL DEFAULT 0,
  `resolution_reason` TEXT NULL,
  `resolved_at` DATETIME(3) NULL,
  `dismissed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `workflow_dead_letters_workflow_run_id_key` (`workflow_run_id`),
  INDEX `workflow_dead_letters_business_status_created_idx` (`business_id`, `status`, `created_at`),
  INDEX `workflow_dead_letters_business_owner_status_idx` (`business_id`, `owner_user_id`, `status`),
  INDEX `workflow_dead_letters_workflow_created_idx` (`workflow_id`, `created_at`),
  CONSTRAINT `workflow_dead_letters_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_dead_letters_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_dead_letters_workflow_run_id_fkey`
    FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_dead_letters_owner_user_id_fkey`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_dead_letter_decisions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `dead_letter_id` VARCHAR(191) NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `action` ENUM('created', 'refreshed', 'retry_started', 'retry_succeeded', 'retry_failed', 'resolved', 'dismissed') NOT NULL,
  `reason` TEXT NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `workflow_dead_letter_decisions_business_letter_created_idx` (`business_id`, `dead_letter_id`, `created_at`),
  INDEX `workflow_dead_letter_decisions_business_action_created_idx` (`business_id`, `action`, `created_at`),
  CONSTRAINT `workflow_dead_letter_decisions_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_dead_letter_decisions_dead_letter_id_fkey`
    FOREIGN KEY (`dead_letter_id`) REFERENCES `workflow_dead_letters` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_dead_letter_decisions_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
