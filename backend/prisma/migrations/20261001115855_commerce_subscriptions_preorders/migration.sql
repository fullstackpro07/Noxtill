-- Autonomous Commerce: Subscriptions & Pre-orders. Only commerce_subscription*/commerce_preorder* statements kept.

CREATE TABLE `commerce_subscription_plans` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `qty_per_cycle` INTEGER NOT NULL,
    `interval` ENUM('week', 'month') NOT NULL,
    `interval_count` INTEGER NOT NULL DEFAULT 1,
    `price_per_unit` DECIMAL(12, 2) NULL,
    `allow_skip` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_subscription_plans_business_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'paused', 'cancelled') NOT NULL DEFAULT 'active',
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `next_renewal_at` DATETIME(3) NOT NULL,
    `skip_next_cycle` BOOLEAN NOT NULL DEFAULT false,
    `status_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_subscriptions_business_status_next_idx`(`business_id`, `status`, `next_renewal_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_subscription_cycles` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `subscription_id` VARCHAR(191) NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `status` ENUM('processing', 'order_created', 'skipped') NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_subscription_cycles_subscription_due_key`(`subscription_id`, `due_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_preorder_campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `promised_date` DATETIME(3) NOT NULL,
    `max_units` INTEGER NULL,
    `reserved_units` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('open', 'closed', 'released') NOT NULL DEFAULT 'open',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_preorder_campaigns_business_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_preorders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `status` ENUM('reserved', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'reserved',
    `promised_date` DATETIME(3) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_preorders_business_campaign_status_idx`(`business_id`, `campaign_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_subscription_audits` (
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

    INDEX `commerce_subscription_audits_biz_entity_created_idx`(`business_id`, `entity_type`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_subscription_plans` ADD CONSTRAINT `commerce_subscription_plans_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscription_plans` ADD CONSTRAINT `commerce_subscription_plans_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscriptions` ADD CONSTRAINT `commerce_subscriptions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscriptions` ADD CONSTRAINT `commerce_subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commerce_subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscriptions` ADD CONSTRAINT `commerce_subscriptions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscription_cycles` ADD CONSTRAINT `commerce_subscription_cycles_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_subscription_cycles` ADD CONSTRAINT `commerce_subscription_cycles_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `commerce_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_subscription_cycles` ADD CONSTRAINT `commerce_subscription_cycles_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_preorder_campaigns` ADD CONSTRAINT `commerce_preorder_campaigns_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_preorder_campaigns` ADD CONSTRAINT `commerce_preorder_campaigns_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_preorders` ADD CONSTRAINT `commerce_preorders_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_preorders` ADD CONSTRAINT `commerce_preorders_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `commerce_preorder_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `commerce_preorders` ADD CONSTRAINT `commerce_preorders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_preorders` ADD CONSTRAINT `commerce_preorders_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `commerce_subscription_audits` ADD CONSTRAINT `commerce_subscription_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
