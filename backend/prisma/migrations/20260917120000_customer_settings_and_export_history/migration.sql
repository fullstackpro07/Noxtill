-- Customer Settings (custom fields, tags catalog, merge rules, privacy toggles), a real bulk
-- Customer Export history, and a persisted "not a duplicate" dismissal — replacing the
-- Customers module's disclosed-as-unavailable placeholders with real, working features.
--
-- NOTE: this migration originally failed partway through (MySQL identifier-length limit on the
-- duplicate-dismissals unique index) after the `customers` ALTER and the first five CREATE TABLEs
-- had already applied. Rather than drop and recreate those, this file was edited down to just the
-- remaining work: the sixth table (with a shortened index name) and every AddForeignKey (none of
-- which had run yet, since they were sequenced after the table that failed).

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
