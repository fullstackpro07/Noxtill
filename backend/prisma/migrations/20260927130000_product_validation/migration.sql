ALTER TABLE `product_opportunities`
  MODIFY `status` ENUM(
    'discovered',
    'saved',
    'watching',
    'dismissed',
    'validation_requested',
    'test_approved',
    'launch_approved',
    'rejected'
  ) NOT NULL DEFAULT 'discovered';

CREATE TABLE `validation_runs` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `opportunity_id` VARCHAR(191) NOT NULL,
  `decision` ENUM('approve_test', 'approve_launch', 'watch', 'reject') NOT NULL,
  `reason` TEXT NOT NULL,
  `evidence_snapshot` JSON NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `validation_runs_business_opportunity_created_idx` (`business_id`, `opportunity_id`, `created_at`),
  INDEX `validation_runs_business_decision_created_idx` (`business_id`, `decision`, `created_at`),
  CONSTRAINT `validation_runs_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `validation_runs_opportunity_id_fkey`
    FOREIGN KEY (`opportunity_id`) REFERENCES `product_opportunities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
