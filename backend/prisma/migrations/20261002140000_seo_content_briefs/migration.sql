CREATE TABLE `seo_content_briefs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `keyword_id` VARCHAR(191) NULL,
    `keyword_text` VARCHAR(191) NULL,
    `topic` VARCHAR(300) NOT NULL,
    `intent` VARCHAR(24) NULL,
    `audience` VARCHAR(300) NULL,
    `format` ENUM('blog_post', 'guide', 'landing_page', 'faq', 'location_page', 'product_page', 'other') NOT NULL DEFAULT 'blog_post',
    `outline` JSON NOT NULL,
    `questions` JSON NOT NULL,
    `internal_links` JSON NOT NULL,
    `source_notes` TEXT NULL,
    `strategy_note` TEXT NULL,
    `status` ENUM('brief', 'drafting', 'approval_required', 'approved', 'published', 'dismissed') NOT NULL DEFAULT 'brief',
    `brief_source` VARCHAR(16) NOT NULL DEFAULT 'manual',
    `draft_title` VARCHAR(300) NULL,
    `draft_body` MEDIUMTEXT NULL,
    `draft_source` VARCHAR(16) NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `due_at` DATETIME(3) NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `decision_note` TEXT NULL,
    `published_url` VARCHAR(2048) NULL,
    `published_at` DATETIME(3) NULL,
    `live_confirmed_at` DATETIME(3) NULL,
    `baseline_rank` INTEGER NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_content_briefs_business_status_updated_idx`(`business_id`, `status`, `updated_at`),
    INDEX `seo_content_briefs_business_keyword_idx`(`business_id`, `keyword_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_content_brief_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `brief_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `note` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seo_content_brief_audits_biz_brief_created_idx`(`business_id`, `brief_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_content_dismissals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `keyword_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `reason` TEXT NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `seo_content_dismissals_business_keyword_kind_key`(`business_id`, `keyword_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_content_briefs` ADD CONSTRAINT `seo_content_briefs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `seo_content_briefs` ADD CONSTRAINT `seo_content_briefs_keyword_id_fkey` FOREIGN KEY (`keyword_id`) REFERENCES `tracked_keywords`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `seo_content_brief_audits` ADD CONSTRAINT `seo_content_brief_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `seo_content_dismissals` ADD CONSTRAINT `seo_content_dismissals_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
