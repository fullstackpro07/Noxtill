-- Real customer-granted video-testimonial consent, multiple real public-review platform
-- destinations (beyond the single primary `publicReviewUrl`), and a weekly review-metrics
-- snapshot table (mirrors `health_score_snapshots`) so the Sentiment and Competitors screens have
-- real historical points to chart instead of a fabricated multi-month curve.

-- AlterTable
ALTER TABLE `video_testimonials`
    ADD COLUMN `consent_website` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `consent_social` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `consent_paid_ads` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `consent_signed_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `review_platform_destinations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `review_platform_destinations_business_id_platform_key`(`business_id`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_metrics_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `average_rating` DECIMAL(3, 2) NOT NULL,
    `total_reviews` INTEGER NOT NULL,
    `positive_theme_pct` DECIMAL(5, 2) NULL,
    `negative_theme_pct` DECIMAL(5, 2) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `review_metrics_snapshots_business_id_captured_at_idx`(`business_id`, `captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `review_platform_destinations` ADD CONSTRAINT `review_platform_destinations_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_metrics_snapshots` ADD CONSTRAINT `review_metrics_snapshots_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
