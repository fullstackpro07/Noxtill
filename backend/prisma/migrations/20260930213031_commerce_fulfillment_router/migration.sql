-- Autonomous Commerce: Fulfillment Router decisions and line allocations (hand-extracted; unrelated drift excluded).
-- CreateTable
CREATE TABLE `commerce_routing_decisions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'superseded', 'cancelled') NOT NULL DEFAULT 'active',
    `mode` ENUM('single', 'split') NOT NULL,
    `destination_country` VARCHAR(2) NULL,
    `policy_version` VARCHAR(32) NOT NULL,
    `recommended_node_ids` JSON NOT NULL,
    `overrode_recommendation` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NULL,
    `evidence` JSON NOT NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `ended_at` DATETIME(3) NULL,
    `ended_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_routing_decisions_biz_status_created_idx`(`business_id`, `status`, `created_at`),
    INDEX `commerce_routing_decisions_business_order_idx`(`business_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_routing_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `decision_id` VARCHAR(191) NOT NULL,
    `order_item_id` VARCHAR(191) NOT NULL,
    `node_id` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,

    INDEX `commerce_routing_allocations_business_node_idx`(`business_id`, `node_id`),
    UNIQUE INDEX `commerce_routing_allocations_decision_item_key`(`decision_id`, `order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commerce_routing_decisions` ADD CONSTRAINT `commerce_routing_decisions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_routing_decisions` ADD CONSTRAINT `commerce_routing_decisions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_routing_allocations` ADD CONSTRAINT `commerce_routing_allocations_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_routing_allocations` ADD CONSTRAINT `commerce_routing_allocations_decision_id_fkey` FOREIGN KEY (`decision_id`) REFERENCES `commerce_routing_decisions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_routing_allocations` ADD CONSTRAINT `commerce_routing_allocations_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_routing_allocations` ADD CONSTRAINT `commerce_routing_allocations_node_id_fkey` FOREIGN KEY (`node_id`) REFERENCES `commerce_fulfillment_nodes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
