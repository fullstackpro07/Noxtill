CREATE TABLE `bi_scenario_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `series_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `scenario_type` ENUM('price', 'stock', 'staff', 'marketing') NOT NULL,
    `assumptions` JSON NOT NULL,
    `baseline` JSON NOT NULL,
    `outcome` JSON NULL,
    `calculation_status` ENUM('calculated', 'assumptions_only') NOT NULL,
    `calculation_note` TEXT NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `bi_scenario_versions_business_series_version_key` (`business_id`, `series_id`, `version`),
    INDEX `bi_scenario_versions_business_created_idx` (`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bi_scenario_versions` ADD CONSTRAINT `bi_scenario_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
