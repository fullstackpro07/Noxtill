-- Autonomous Commerce: Production & Assembly (BOMs, work orders, materials, audit) + production stock movement kinds. Hand-extracted; unrelated drift excluded.
-- AlterTable
ALTER TABLE `stock_movements` MODIFY `kind` ENUM('purchase', 'sale', 'wastage', 'adjustment', 'return', 'transfer_out', 'transfer_in', 'production_consume', 'production_output') NOT NULL;

-- CreateTable
CREATE TABLE `commerce_boms` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `scrap_allowance_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `labor_cost_per_unit` DECIMAL(12, 2) NULL,
    `overhead_cost_per_unit` DECIMAL(12, 2) NULL,
    `notes` TEXT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_boms_business_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `commerce_boms_business_product_version_key`(`business_id`, `product_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_bom_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bom_id` VARCHAR(191) NOT NULL,
    `component_product_id` VARCHAR(191) NOT NULL,
    `qty_per_unit` DECIMAL(12, 4) NOT NULL,

    UNIQUE INDEX `commerce_bom_items_bom_component_key`(`bom_id`, `component_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_work_orders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `bom_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `qty_planned` INTEGER NOT NULL,
    `qty_good` INTEGER NULL,
    `qty_scrap` INTEGER NULL,
    `status` ENUM('planned', 'in_progress', 'quality_hold', 'completed', 'cancelled') NOT NULL DEFAULT 'planned',
    `due_date` DATETIME(3) NULL,
    `facility` VARCHAR(120) NULL,
    `demand_source` VARCHAR(200) NULL,
    `estimated_cost` DECIMAL(14, 2) NOT NULL,
    `actual_cost` DECIMAL(14, 2) NULL,
    `quality_passed` BOOLEAN NULL,
    `quality_notes` TEXT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_reason` TEXT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_work_orders_business_status_due_idx`(`business_id`, `status`, `due_date`),
    UNIQUE INDEX `commerce_work_orders_business_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_work_order_materials` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `work_order_id` VARCHAR(191) NOT NULL,
    `component_product_id` VARCHAR(191) NOT NULL,
    `qty_required` INTEGER NOT NULL,
    `qty_consumed` INTEGER NULL,
    `unit_cost_estimated` DECIMAL(12, 2) NOT NULL,
    `unit_cost_consumed` DECIMAL(12, 2) NULL,

    UNIQUE INDEX `commerce_wo_materials_wo_component_key`(`work_order_id`, `component_product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_work_order_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `work_order_id` VARCHAR(191) NULL,
    `bom_id` VARCHAR(191) NULL,
    `action` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_wo_audits_biz_wo_created_idx`(`business_id`, `work_order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commerce_boms` ADD CONSTRAINT `commerce_boms_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_boms` ADD CONSTRAINT `commerce_boms_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_bom_items` ADD CONSTRAINT `commerce_bom_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_bom_items` ADD CONSTRAINT `commerce_bom_items_bom_id_fkey` FOREIGN KEY (`bom_id`) REFERENCES `commerce_boms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_bom_items` ADD CONSTRAINT `commerce_bom_items_component_product_id_fkey` FOREIGN KEY (`component_product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_orders` ADD CONSTRAINT `commerce_work_orders_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_orders` ADD CONSTRAINT `commerce_work_orders_bom_id_fkey` FOREIGN KEY (`bom_id`) REFERENCES `commerce_boms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_orders` ADD CONSTRAINT `commerce_work_orders_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_order_materials` ADD CONSTRAINT `commerce_work_order_materials_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_order_materials` ADD CONSTRAINT `commerce_work_order_materials_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `commerce_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_work_order_materials` ADD CONSTRAINT `commerce_work_order_materials_component_product_id_fkey` FOREIGN KEY (`component_product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_order_audits` ADD CONSTRAINT `commerce_work_order_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_work_order_audits` ADD CONSTRAINT `commerce_work_order_audits_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `commerce_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
