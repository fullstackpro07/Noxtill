ALTER TABLE `workflows`
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `workflow_runs`
    ADD COLUMN `workflow_version` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `workflows`
    MODIFY `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried') NOT NULL;

ALTER TABLE `outbound_webhooks`
    MODIFY `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried') NOT NULL;

CREATE TABLE `workflow_versions` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `trigger_key` ENUM('sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review', 'credit_overdue', 'birthday', 'payment_received', 'complaint_received', 'stock_changed', 'delivery_created', 'delivery_assigned', 'delivery_picked_up', 'delivery_en_route', 'delivery_delivered', 'delivery_failed', 'delivery_retried') NOT NULL,
    `conditions` JSON NOT NULL,
    `actions` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `workflow_versions_workflow_id_version_key`(`workflow_id`, `version`),
    INDEX `workflow_versions_business_id_workflow_id_created_at_idx`(`business_id`, `workflow_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `workflow_versions`
    (`id`, `workflow_id`, `business_id`, `version`, `name`, `trigger_key`, `conditions`, `actions`, `created_at`)
SELECT
    UUID(), `id`, `business_id`, `version`, `name`, `trigger_key`, `conditions`, `actions`, `created_at`
FROM `workflows`;

ALTER TABLE `workflow_versions`
    ADD CONSTRAINT `workflow_versions_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `workflow_versions`
    ADD CONSTRAINT `workflow_versions_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
