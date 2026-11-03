CREATE TABLE `seo_off_page_links` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `relationship_key` CHAR(64) NOT NULL,
    `source_domain` VARCHAR(253) NOT NULL,
    `source_url` VARCHAR(2048) NOT NULL,
    `target_url` VARCHAR(2048) NOT NULL,
    `anchor_text` TEXT NULL,
    `link_type` VARCHAR(32) NOT NULL DEFAULT 'unknown',
    `status` VARCHAR(24) NOT NULL DEFAULT 'active',
    `first_seen_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `evidence_note` TEXT NOT NULL,
    `relevance_note` TEXT NULL,
    `quality_note` TEXT NULL,
    `risk_note` TEXT NULL,
    `source_name` VARCHAR(64) NOT NULL DEFAULT 'merchant-entered',
    `tracked` BOOLEAN NOT NULL DEFAULT true,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_off_page_links_business_status_created_idx`(`business_id`, `status`, `created_at`),
    INDEX `seo_off_page_links_business_last_seen_idx`(`business_id`, `last_seen_at`),
    UNIQUE INDEX `seo_off_page_links_business_relationship_key`(`business_id`, `relationship_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_off_page_opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `opportunity_key` CHAR(64) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `prospect_url` VARCHAR(2048) NOT NULL,
    `target_url` VARCHAR(2048) NULL,
    `evidence_note` TEXT NOT NULL,
    `relevance_note` TEXT NOT NULL,
    `quality_note` TEXT NULL,
    `risk_note` TEXT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'open',
    `pipeline` VARCHAR(24) NOT NULL DEFAULT 'unassigned',
    `tracked` BOOLEAN NOT NULL DEFAULT true,
    `dismiss_reason` TEXT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_off_page_opps_business_status_kind_idx`(`business_id`, `status`, `kind`),
    INDEX `seo_off_page_opps_business_pipeline_status_idx`(`business_id`, `pipeline`, `status`),
    UNIQUE INDEX `seo_off_page_opps_business_key_key`(`business_id`, `opportunity_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_off_page_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(24) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(48) NOT NULL,
    `reason` TEXT NULL,
    `before_state` JSON NULL,
    `after_state` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seo_off_page_audits_entity_created_idx`(`business_id`, `entity_type`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_off_page_links` ADD CONSTRAINT `seo_off_page_links_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_off_page_opportunities` ADD CONSTRAINT `seo_off_page_opportunities_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_off_page_audits` ADD CONSTRAINT `seo_off_page_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
