-- Customer Settings (custom fields, tags catalog, merge rules, privacy toggles), a real bulk
-- Customer Export history, and a persisted "not a duplicate" dismissal — replacing the
-- Customers module's disclosed-as-unavailable placeholders with real, working features.

-- AlterTable
ALTER TABLE `customers`
    ADD COLUMN `status` ENUM('active', 'inactive', 'archived', 'blocked') NOT NULL DEFAULT 'active',
    ADD COLUMN `custom_field_values` JSON NOT NULL DEFAULT ('{}');

-- CreateTable
CREATE TABLE `customer_custom_fields` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('text', 'select', 'date', 'number') NOT NULL DEFAULT 'text',
    `options` JSON NOT NULL DEFAULT ('[]'),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_custom_fields_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_tags` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('manual', 'rule_based') NOT NULL DEFAULT 'manual',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customer_tags_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_merge_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `match_on` ENUM('phone_or_email', 'phone_only', 'name_and_phone') NOT NULL DEFAULT 'phone_or_email',
    `conflict_resolution` ENUM('primary', 'most_recent', 'ask') NOT NULL DEFAULT 'primary',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_merge_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_privacy_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `credit_balance_visible_to_staff` BOOLEAN NOT NULL DEFAULT false,
    `notes_visible_to_staff` BOOLEAN NOT NULL DEFAULT true,
    `staff_can_export` BOOLEAN NOT NULL DEFAULT false,
    `staff_can_merge` BOOLEAN NOT NULL DEFAULT false,
    `staff_can_archive` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_privacy_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_export_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `format` ENUM('csv', 'xlsx', 'pdf') NOT NULL DEFAULT 'csv',
    `row_count` INTEGER NOT NULL,
    `fields` JSON NOT NULL DEFAULT ('[]'),
    `file_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `customer_export_logs_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_duplicate_dismissals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id_low` VARCHAR(191) NOT NULL,
    `customer_id_high` VARCHAR(191) NOT NULL,
    `dismissed_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customer_dup_dismissals_biz_low_high_key`(`business_id`, `customer_id_low`, `customer_id_high`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_custom_fields` ADD CONSTRAINT `customer_custom_fields_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_merge_settings` ADD CONSTRAINT `customer_merge_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_privacy_settings` ADD CONSTRAINT `customer_privacy_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_export_logs` ADD CONSTRAINT `customer_export_logs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_duplicate_dismissals` ADD CONSTRAINT `customer_duplicate_dismissals_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
