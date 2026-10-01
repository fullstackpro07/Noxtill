-- Autonomous Commerce: Store Optimizer. Only commerce_store_* statements kept.

CREATE TABLE `commerce_store_opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `rule_key` ENUM('missing_photo', 'missing_category', 'high_return_rate', 'out_of_stock_demand', 'below_cost_price', 'listing_not_synced') NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `impact` ENUM('low', 'medium', 'high') NOT NULL,
    `status` ENUM('open', 'in_progress', 'done', 'verified', 'dismissed') NOT NULL DEFAULT 'open',
    `evidence` JSON NOT NULL,
    `metric_value` DECIMAL(12, 2) NULL,
    `baseline_value` DECIMAL(12, 2) NULL,
    `resolution` TEXT NULL,
    `first_detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verified_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_store_opportunities_business_status_impact_idx`(`business_id`, `status`, `impact`),
    UNIQUE INDEX `commerce_store_opportunities_business_dedupe_key`(`business_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_store_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `opportunity_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_store_audits_biz_opp_created_idx`(`business_id`, `opportunity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_store_opportunities` ADD CONSTRAINT `commerce_store_opportunities_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_store_opportunities` ADD CONSTRAINT `commerce_store_opportunities_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_store_audits` ADD CONSTRAINT `commerce_store_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
