-- A/B-test setup + fatigue-warning depth fix: a real experiment-grouping key on creatives, and a
-- real timestamped stats history so a genuine fatigue trend can be measured (never fabricated for
-- a gap in history).

-- AlterTable
ALTER TABLE `ad_creatives` ADD COLUMN `experiment_key` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ad_creatives_business_id_experiment_key_idx` ON `ad_creatives`(`business_id`, `experiment_key`);

-- CreateTable
CREATE TABLE `ad_campaign_stats_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `campaign_id` VARCHAR(191) NOT NULL,
    `spend` DECIMAL(12, 2) NOT NULL,
    `impressions` INTEGER NOT NULL,
    `clicks` INTEGER NOT NULL,
    `results` INTEGER NOT NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ad_campaign_stats_snapshots_campaign_id_captured_at_idx`(`campaign_id`, `captured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ad_campaign_stats_snapshots` ADD CONSTRAINT `ad_campaign_stats_snapshots_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ad_campaign_stats_snapshots` ADD CONSTRAINT `ad_campaign_stats_snapshots_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
