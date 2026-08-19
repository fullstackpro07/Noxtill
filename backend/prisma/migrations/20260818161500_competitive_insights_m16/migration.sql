-- AlterTable
ALTER TABLE `competitors` ADD COLUMN `meta_page_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `visibility_score_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `listing_score` DECIMAL(5, 2) NOT NULL,
    `review_score` DECIMAL(5, 2) NOT NULL,
    `seo_score` DECIMAL(5, 2) NOT NULL,
    `social_score` DECIMAL(5, 2) NOT NULL,
    `total_score` DECIMAL(5, 2) NOT NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `visibility_score_snapshots_business_id_captured_at_idx`(`business_id`, `captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competitive_opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('keyword', 'review', 'listing', 'social') NOT NULL,
    `evidence` TEXT NOT NULL,
    `evidence_ref` VARCHAR(191) NULL,
    `recommendation` TEXT NULL,
    `dismissed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `competitive_opportunities_business_id_dismissed_created_at_idx`(`business_id`, `dismissed`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competitive_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `scan_frequency_days` INTEGER NOT NULL DEFAULT 7,
    `keyword_rank_alert_threshold` INTEGER NOT NULL DEFAULT 10,
    `review_freshness_alert_days` INTEGER NOT NULL DEFAULT 14,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `competitive_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `visibility_score_snapshots` ADD CONSTRAINT `visibility_score_snapshots_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competitive_opportunities` ADD CONSTRAINT `competitive_opportunities_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competitive_settings` ADD CONSTRAINT `competitive_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
