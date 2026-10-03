CREATE TABLE `bi_twin_assumption_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `series_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `entity_type` ENUM('business', 'branch', 'staff', 'product', 'supplier') NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `assumption_key` ENUM('staff_weekly_hours', 'supplier_lead_days', 'product_reorder_buffer_units', 'branch_daily_capacity', 'expense_adjustment_percent') NOT NULL,
    `value` DECIMAL(14, 4) NOT NULL,
    `rationale` TEXT NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `bi_twin_assumption_versions_business_series_version_key` (`business_id`, `series_id`, `version`),
    INDEX `bi_twin_assumption_versions_business_entity_idx` (`business_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bi_twin_assumption_versions` ADD CONSTRAINT `bi_twin_assumption_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
