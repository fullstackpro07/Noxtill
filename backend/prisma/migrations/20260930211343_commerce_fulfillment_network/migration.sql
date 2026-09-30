-- Autonomous Commerce: Fulfillment Network nodes, product mappings and audit (hand-extracted; unrelated drift excluded).
-- CreateTable
CREATE TABLE `commerce_fulfillment_nodes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('own_location', 'third_party_warehouse', 'dropship_supplier', 'print_on_demand', 'manufacturer', 'marketplace_fulfillment', 'other') NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `branch_business_id` VARCHAR(191) NULL,
    `supplier_id` VARCHAR(191) NULL,
    `country` VARCHAR(2) NULL,
    `service_markets` JSON NOT NULL,
    `processing_days` INTEGER NULL,
    `cutoff_time` VARCHAR(5) NULL,
    `cost_per_order` DECIMAL(12, 2) NULL,
    `daily_capacity` INTEGER NULL,
    `notes` TEXT NULL,
    `disabled_reason` TEXT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_fulfillment_nodes_business_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `commerce_fulfillment_nodes_business_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_fulfillment_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `role` ENUM('primary', 'backup') NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_fulfillment_mappings_business_product_idx`(`business_id`, `product_id`),
    UNIQUE INDEX `commerce_fulfillment_mappings_biz_node_product_key`(`business_id`, `node_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_fulfillment_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NULL,
    `action` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_fulfillment_audits_biz_node_created_idx`(`business_id`, `node_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commerce_fulfillment_nodes` ADD CONSTRAINT `commerce_fulfillment_nodes_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_fulfillment_nodes` ADD CONSTRAINT `commerce_fulfillment_nodes_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `commerce_fulfillment_mappings` ADD CONSTRAINT `commerce_fulfillment_mappings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_fulfillment_mappings` ADD CONSTRAINT `commerce_fulfillment_mappings_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `commerce_fulfillment_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_fulfillment_mappings` ADD CONSTRAINT `commerce_fulfillment_mappings_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_fulfillment_audits` ADD CONSTRAINT `commerce_fulfillment_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
