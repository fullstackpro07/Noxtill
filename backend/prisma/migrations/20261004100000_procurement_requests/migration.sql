CREATE TABLE `procurement_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `requester_user_id` VARCHAR(191) NOT NULL,
    `branch_business_id` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `cost_center` VARCHAR(191) NULL,
    `needed_by` DATETIME(3) NULL,
    `reason` TEXT NOT NULL,
    `urgency` ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    `budget_code` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled') NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `decision_reason` TEXT NULL,
    `supplier_id` VARCHAR(191) NULL,
    `attachment_urls` JSON NOT NULL,
    `converted_purchase_order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `procurement_requests_converted_purchase_order_id_key` (`converted_purchase_order_id`),
    INDEX `procurement_requests_business_id_status_created_at_idx` (`business_id`, `status`, `created_at`),
    INDEX `procurement_requests_requester_user_id_created_at_idx` (`requester_user_id`, `created_at`),
    INDEX `procurement_requests_branch_business_id_idx` (`branch_business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `procurement_request_items` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `line_type` ENUM('stock', 'service', 'asset', 'expense') NOT NULL DEFAULT 'stock',
    `product_id` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(191) NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `estimated_unit_cost` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `procurement_request_items_request_id_idx` (`request_id`),
    INDEX `procurement_request_items_product_id_idx` (`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `procurement_request_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `event_type` ENUM('created', 'updated', 'submitted', 'approved', 'rejected', 'cancelled', 'converted') NOT NULL,
    `from_status` ENUM('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled') NULL,
    `to_status` ENUM('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled') NULL,
    `version` INTEGER NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `procurement_request_events_business_id_request_id_created_at_idx` (`business_id`, `request_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_requester_user_id_fkey` FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_branch_business_id_fkey` FOREIGN KEY (`branch_business_id`) REFERENCES `businesses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `procurement_requests` ADD CONSTRAINT `procurement_requests_converted_purchase_order_id_fkey` FOREIGN KEY (`converted_purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `procurement_request_items` ADD CONSTRAINT `procurement_request_items_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `procurement_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `procurement_request_items` ADD CONSTRAINT `procurement_request_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `procurement_request_events` ADD CONSTRAINT `procurement_request_events_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `procurement_request_events` ADD CONSTRAINT `procurement_request_events_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `procurement_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `procurement_request_events` ADD CONSTRAINT `procurement_request_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
