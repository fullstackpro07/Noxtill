CREATE TABLE `product_opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `source_reference` VARCHAR(191) NULL,
    `external_entity_id` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `market` VARCHAR(191) NULL,
    `observed_price` DECIMAL(12, 2) NULL,
    `estimated_landed_cost` DECIMAL(12, 2) NULL,
    `demand_signal` INTEGER NULL,
    `competition_score` INTEGER NULL,
    `trend_velocity` INTEGER NULL,
    `store_fit_score` INTEGER NULL,
    `margin_estimate` DECIMAL(5, 2) NULL,
    `supplier_count` INTEGER NULL,
    `shipping_estimate` DECIMAL(12, 2) NULL,
    `risk` ENUM('low', 'medium', 'high', 'blocked') NOT NULL DEFAULT 'medium',
    `status` ENUM('discovered', 'saved', 'watching', 'dismissed', 'validation_requested') NOT NULL DEFAULT 'discovered',
    `evidence` TEXT NULL,
    `confidence` INTEGER NULL,
    `source_fresh_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `product_opportunities_business_id_status_updated_at_idx`(`business_id`, `status`, `updated_at`),
    INDEX `product_opportunities_business_id_source_source_fresh_at_idx`(`business_id`, `source`, `source_fresh_at`),
    CONSTRAINT `product_opportunities_business_id_fkey`
      FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_opportunity_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `opportunity_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `product_opp_audits_business_opportunity_created_idx`(`business_id`, `opportunity_id`, `created_at`),
    CONSTRAINT `product_opportunity_audits_business_id_fkey`
      FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `product_opportunity_audits_opportunity_id_fkey`
      FOREIGN KEY (`opportunity_id`) REFERENCES `product_opportunities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
