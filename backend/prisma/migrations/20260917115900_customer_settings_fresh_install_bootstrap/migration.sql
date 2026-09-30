-- The following migration (20260917120000_customer_settings_and_export_history) was shortened
-- after a partial production apply. That leaves fresh databases without the first five customer
-- settings tables or the two customer columns. Restore that first stage before the remaining
-- historical migration runs. IF NOT EXISTS / metadata checks keep existing installations safe.

-- Add the customer columns only when absent; existing installations already received these in the
-- original partial apply. Fresh installs reach this migration with no customer data to preserve.
SET @noxtill_add_customer_status_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'status') = 0,
    'ALTER TABLE `customers` ADD COLUMN `status` ENUM(''active'', ''inactive'', ''archived'', ''blocked'') NOT NULL DEFAULT ''active''',
    'SELECT 1'
);
PREPARE noxtill_customer_status_stmt FROM @noxtill_add_customer_status_sql;
EXECUTE noxtill_customer_status_stmt;
DEALLOCATE PREPARE noxtill_customer_status_stmt;

SET @noxtill_add_customer_fields_sql = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'custom_field_values') = 0,
    'ALTER TABLE `customers` ADD COLUMN `custom_field_values` JSON NOT NULL',
    'SELECT 1'
);
PREPARE noxtill_customer_fields_stmt FROM @noxtill_add_customer_fields_sql;
EXECUTE noxtill_customer_fields_stmt;
DEALLOCATE PREPARE noxtill_customer_fields_stmt;

CREATE TABLE IF NOT EXISTS `customer_custom_fields` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('text', 'select', 'date', 'number') NOT NULL DEFAULT 'text',
    `options` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_custom_fields_business_id_name_key` (`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_tags` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` ENUM('manual', 'rule_based') NOT NULL DEFAULT 'manual',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `customer_tags_business_id_name_key` (`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_merge_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `match_on` ENUM('phone_or_email', 'phone_only', 'name_and_phone') NOT NULL DEFAULT 'phone_or_email',
    `conflict_resolution` ENUM('primary', 'most_recent', 'ask') NOT NULL DEFAULT 'primary',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_merge_settings_business_id_key` (`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_privacy_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `credit_balance_visible_to_staff` BOOLEAN NOT NULL DEFAULT false,
    `notes_visible_to_staff` BOOLEAN NOT NULL DEFAULT true,
    `staff_can_export` BOOLEAN NOT NULL DEFAULT false,
    `staff_can_merge` BOOLEAN NOT NULL DEFAULT false,
    `staff_can_archive` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_privacy_settings_business_id_key` (`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_export_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `format` ENUM('csv', 'excel', 'pdf') NOT NULL DEFAULT 'csv',
    `row_count` INTEGER NOT NULL,
    `fields` JSON NOT NULL,
    `file_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `customer_export_logs_business_id_idx` (`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
