CREATE TABLE `seo_content_revisions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `page_url` VARCHAR(2048) NOT NULL,
    `page_key` CHAR(64) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('draft', 'approval_required', 'approved', 'rejected', 'applied', 'verified', 'superseded') NOT NULL DEFAULT 'draft',
    `before_snapshot` JSON NOT NULL,
    `proposed_title` VARCHAR(300) NULL,
    `proposed_meta_description` VARCHAR(500) NULL,
    `proposed_h1` VARCHAR(300) NULL,
    `primary_keyword` VARCHAR(191) NULL,
    `rationale` TEXT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'manual',
    `created_by_user_id` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `decided_at` DATETIME(3) NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `decision_note` TEXT NULL,
    `applied_at` DATETIME(3) NULL,
    `applied_by_user_id` VARCHAR(191) NULL,
    `verified_at` DATETIME(3) NULL,
    `verification` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_content_revisions_business_status_updated_idx`(`business_id`, `status`, `updated_at`),
    UNIQUE INDEX `seo_content_revisions_business_page_version_key`(`business_id`, `page_key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_content_revision_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `revision_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `note` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seo_content_revision_audits_biz_rev_created_idx`(`business_id`, `revision_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_content_revisions` ADD CONSTRAINT `seo_content_revisions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `seo_content_revision_audits` ADD CONSTRAINT `seo_content_revision_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
