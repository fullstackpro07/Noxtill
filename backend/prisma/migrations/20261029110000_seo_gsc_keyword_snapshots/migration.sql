CREATE UNIQUE INDEX `tracked_keywords_id_business_key`
    ON `tracked_keywords` (`id`, `business_id`);

CREATE TABLE `seo_search_console_keyword_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `keyword_id` VARCHAR(191) NOT NULL,
    `property_hash` CHAR(64) NOT NULL,
    `start_date` CHAR(10) NOT NULL,
    `end_date` CHAR(10) NOT NULL,
    `clicks` BIGINT NULL,
    `impressions` BIGINT NULL,
    `click_through_rate` DECIMAL(12, 10) NULL,
    `average_position` DECIMAL(12, 4) NULL,
    `data_state` VARCHAR(20) NOT NULL DEFAULT 'final',
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `seo_gsc_keyword_snapshots_window_uq` (`business_id`, `keyword_id`, `property_hash`, `start_date`, `end_date`),
    INDEX `seo_gsc_keyword_snapshots_lookup_idx` (`business_id`, `keyword_id`, `end_date`, `fetched_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_search_console_keyword_snapshots`
    ADD CONSTRAINT `seo_search_console_keyword_snapshots_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_search_console_keyword_snapshots`
    ADD CONSTRAINT `seo_search_console_keyword_snapshots_keyword_id_business_id_fkey`
    FOREIGN KEY (`keyword_id`, `business_id`) REFERENCES `tracked_keywords` (`id`, `business_id`) ON DELETE CASCADE ON UPDATE CASCADE;
