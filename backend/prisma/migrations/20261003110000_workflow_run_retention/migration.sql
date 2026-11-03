CREATE TABLE `workflow_retention_cleanups` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `retention_days` INTEGER NOT NULL,
    `deleted_runs` INTEGER NOT NULL,
    `cutoff_at` DATETIME(3) NOT NULL,
    `cleaned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `workflow_retention_cleanups_business_id_cleaned_at_idx`(`business_id`, `cleaned_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workflow_retention_cleanups` ADD CONSTRAINT `workflow_retention_cleanups_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
