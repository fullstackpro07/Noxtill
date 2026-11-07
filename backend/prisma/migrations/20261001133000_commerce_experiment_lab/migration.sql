CREATE TABLE `commerce_experiments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `type` ENUM('price', 'bundle', 'listing_copy', 'photo', 'shipping_offer', 'other') NOT NULL,
    `hypothesis` TEXT NOT NULL,
    `change_description` TEXT NOT NULL,
    `primary_metric` ENUM('units', 'revenue', 'gross_margin', 'return_rate') NOT NULL,
    `min_margin_pct` DECIMAL(5, 2) NULL,
    `planned_days` INTEGER NOT NULL DEFAULT 14,
    `status` ENUM('draft', 'running', 'stopped', 'adopted', 'reverted', 'inconclusive') NOT NULL DEFAULT 'draft',
    `start_snapshot` JSON NULL,
    `stop_snapshot` JSON NULL,
    `frozen_results` JSON NULL,
    `decision_note` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `stopped_at` DATETIME(3) NULL,
    `decided_at` DATETIME(3) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_experiments_business_status_idx`(`business_id`, `status`),
    INDEX `commerce_experiments_business_product_status_idx`(`business_id`, `product_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_experiment_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `experiment_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `note` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_experiment_audits_biz_exp_created_idx`(`business_id`, `experiment_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_experiments` ADD CONSTRAINT `commerce_experiments_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_experiments` ADD CONSTRAINT `commerce_experiments_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_experiment_audits` ADD CONSTRAINT `commerce_experiment_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
