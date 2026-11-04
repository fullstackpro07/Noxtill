CREATE TABLE `inventory_agent_count_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `source_recommendation_id` VARCHAR(191) NOT NULL,
  `stock_count_id` VARCHAR(191) NULL,
  `requested_by_user_id` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'open',
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `inventory_agent_count_tasks_source_recommendation_id_key` (`source_recommendation_id`),
  INDEX `inventory_agent_count_tasks_business_status_created_idx` (`business_id`, `status`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inventory_agent_count_tasks_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inventory_agent_count_tasks_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inventory_agent_count_tasks_source_recommendation_id_fkey`
    FOREIGN KEY (`source_recommendation_id`) REFERENCES `specialist_agent_recommendations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inventory_agent_count_tasks_stock_count_id_fkey`
    FOREIGN KEY (`stock_count_id`) REFERENCES `stock_counts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
