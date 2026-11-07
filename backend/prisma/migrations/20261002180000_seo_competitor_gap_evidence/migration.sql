CREATE TABLE `seo_competitor_gaps` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `competitor_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NULL,
    `intent` VARCHAR(24) NULL,
    `competitor_url` VARCHAR(2048) NULL,
    `owned_page_url` VARCHAR(2048) NULL,
    `source_url` VARCHAR(2048) NOT NULL,
    `source_label` VARCHAR(191) NOT NULL,
    `evidence_note` TEXT NOT NULL,
    `competitor_rank` INTEGER NULL,
    `observed_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'open',
    `action_type` VARCHAR(24) NULL,
    `action_entity_id` VARCHAR(191) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_competitor_gaps_biz_kind_status_observed_idx`(`business_id`, `kind`, `status`, `observed_at`),
    INDEX `seo_competitor_gaps_biz_competitor_observed_idx`(`business_id`, `competitor_id`, `observed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_competitor_gap_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `gap_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(48) NOT NULL,
    `reason` TEXT NULL,
    `before_state` JSON NULL,
    `after_state` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seo_competitor_gap_audits_biz_gap_created_idx`(`business_id`, `gap_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_competitor_gaps` ADD CONSTRAINT `seo_competitor_gaps_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_competitor_gaps` ADD CONSTRAINT `seo_competitor_gaps_competitor_id_fkey` FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_competitor_gap_audits` ADD CONSTRAINT `seo_competitor_gap_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_competitor_gap_audits` ADD CONSTRAINT `seo_competitor_gap_audits_gap_id_fkey` FOREIGN KEY (`gap_id`) REFERENCES `seo_competitor_gaps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
