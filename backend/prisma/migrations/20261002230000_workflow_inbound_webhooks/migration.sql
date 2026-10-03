ALTER TABLE `outbound_webhooks` MODIFY `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried', 'commerce_validation', 'commerce_listing_draft', 'seo_issue_detected', 'commerce_rfq_created', 'commerce_rfq_response_received', 'commerce_rfq_awarded', 'commerce_supplier_claim_created', 'commerce_supplier_claim_settled', 'scheduled', 'inbound_webhook') NOT NULL;

ALTER TABLE `workflow_versions` MODIFY `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried', 'commerce_validation', 'commerce_listing_draft', 'seo_issue_detected', 'commerce_rfq_created', 'commerce_rfq_response_received', 'commerce_rfq_awarded', 'commerce_supplier_claim_created', 'commerce_supplier_claim_settled', 'scheduled', 'inbound_webhook') NOT NULL;

ALTER TABLE `workflows` MODIFY `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried', 'commerce_validation', 'commerce_listing_draft', 'seo_issue_detected', 'commerce_rfq_created', 'commerce_rfq_response_received', 'commerce_rfq_awarded', 'commerce_supplier_claim_created', 'commerce_supplier_claim_settled', 'scheduled', 'inbound_webhook') NOT NULL;

CREATE TABLE `workflow_endpoints` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `token_hint` VARCHAR(8) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `rotated_at` DATETIME(3) NULL,
    `last_received_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workflow_endpoints_workflow_id_key`(`workflow_id`),
    UNIQUE INDEX `workflow_endpoints_token_hash_key`(`token_hash`),
    INDEX `workflow_endpoints_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_endpoint_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `endpoint_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `payload` JSON NULL,
    `payload_bytes` INTEGER NOT NULL,
    `run_id` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `replay_of_id` VARCHAR(191) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_endpoint_deliveries_biz_endpoint_received_idx`(`business_id`, `endpoint_id`, `received_at`),
    INDEX `workflow_endpoint_deliveries_endpoint_dedupe_idx`(`endpoint_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workflow_endpoints` ADD CONSTRAINT `workflow_endpoints_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `workflow_endpoints` ADD CONSTRAINT `workflow_endpoints_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `workflow_endpoint_deliveries` ADD CONSTRAINT `workflow_endpoint_deliveries_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `workflow_endpoint_deliveries` ADD CONSTRAINT `workflow_endpoint_deliveries_endpoint_id_fkey` FOREIGN KEY (`endpoint_id`) REFERENCES `workflow_endpoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
