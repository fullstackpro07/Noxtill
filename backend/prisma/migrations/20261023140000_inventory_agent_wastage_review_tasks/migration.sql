CREATE TABLE `inventory_agent_wastage_review_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `source_recommendation_id` VARCHAR(191) NOT NULL,
  `requested_by_user_id` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'open',
  `reviewed_by_user_id` VARCHAR(191) NULL,
  `review_note` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `dismissed_by_user_id` VARCHAR(191) NULL,
  `dismiss_reason` TEXT NULL,
  `dismissed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `inv_agent_wastage_tasks_source_rec_uq` (`source_recommendation_id`),
  INDEX `inv_agent_wastage_tasks_business_status_idx` (`business_id`, `status`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inv_agent_wastage_tasks_business_fk`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inv_agent_wastage_tasks_product_fk`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inv_agent_wastage_tasks_source_rec_fk`
    FOREIGN KEY (`source_recommendation_id`) REFERENCES `specialist_agent_recommendations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
