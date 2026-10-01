-- Autonomous Commerce: B2B & Wholesale (tiers, price lists, accounts, audit). Only commerce_b2b_* statements kept.

CREATE TABLE `commerce_b2b_tiers` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `default_discount_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `min_order_value` DECIMAL(12, 2) NULL,
    `payment_terms_days` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_b2b_tiers_business_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_b2b_price_lists` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_b2b_price_lists_business_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_b2b_price_list_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `price_list_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `min_qty` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `commerce_b2b_price_list_items_list_product_key`(`price_list_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_b2b_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `company_name` VARCHAR(160) NOT NULL,
    `tax_id` VARCHAR(64) NULL,
    `tier_id` VARCHAR(191) NULL,
    `price_list_id` VARCHAR(191) NULL,
    `payment_terms_days` INTEGER NULL,
    `min_order_value` DECIMAL(12, 2) NULL,
    `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    `suspended_reason` TEXT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_b2b_accounts_customer_id_key`(`customer_id`),
    INDEX `commerce_b2b_accounts_business_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_b2b_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_b2b_audits_biz_entity_created_idx`(`business_id`, `entity_type`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_b2b_tiers` ADD CONSTRAINT `commerce_b2b_tiers_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_price_lists` ADD CONSTRAINT `commerce_b2b_price_lists_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_price_list_items` ADD CONSTRAINT `commerce_b2b_price_list_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_price_list_items` ADD CONSTRAINT `commerce_b2b_price_list_items_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `commerce_b2b_price_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_price_list_items` ADD CONSTRAINT `commerce_b2b_price_list_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_accounts` ADD CONSTRAINT `commerce_b2b_accounts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_accounts` ADD CONSTRAINT `commerce_b2b_accounts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_accounts` ADD CONSTRAINT `commerce_b2b_accounts_tier_id_fkey` FOREIGN KEY (`tier_id`) REFERENCES `commerce_b2b_tiers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_accounts` ADD CONSTRAINT `commerce_b2b_accounts_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `commerce_b2b_price_lists`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_b2b_audits` ADD CONSTRAINT `commerce_b2b_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
