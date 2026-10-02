CREATE TABLE `seo_technical_actions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `type` ENUM('redirect', 'canonical', 'indexability', 'sitemap', 'robots', 'other') NOT NULL,
    `status` ENUM('draft', 'approval_required', 'approved', 'rejected', 'applied', 'verified', 'cancelled') NOT NULL DEFAULT 'draft',
    `risk` VARCHAR(16) NOT NULL,
    `source_url` VARCHAR(2048) NOT NULL,
    `target_value` VARCHAR(2048) NULL,
    `description` TEXT NULL,
    `current_state` JSON NOT NULL,
    `validation` JSON NULL,
    `issue_id` VARCHAR(191) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `decision_note` TEXT NULL,
    `applied_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `verification` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_technical_actions_business_status_updated_idx`(`business_id`, `status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_technical_action_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `action_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `note` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seo_technical_action_audits_biz_action_created_idx`(`business_id`, `action_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_technical_actions` ADD CONSTRAINT `seo_technical_actions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `seo_technical_action_audits` ADD CONSTRAINT `seo_technical_action_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
