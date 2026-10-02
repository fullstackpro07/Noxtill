-- Guest publication prospects and evidence are merchant-entered; no publication discovery provider is assumed.
CREATE TABLE `seo_guest_publications` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `publication_key` CHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `website_url` VARCHAR(2048) NOT NULL,
    `topic_niches` JSON NOT NULL,
    `market` VARCHAR(96) NULL,
    `relevance_evidence` TEXT NOT NULL,
    `quality_evidence` TEXT NOT NULL,
    `guest_policy_url` VARCHAR(2048) NULL,
    `guest_policy_status` VARCHAR(32) NOT NULL DEFAULT 'unknown',
    `contact_name` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `contact_source` TEXT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'prospect',
    `source_name` VARCHAR(32) NOT NULL DEFAULT 'merchant_entered',
    `last_reviewed_at` DATETIME(3) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_guest_publications_business_status_updated_idx`(`business_id`, `status`, `updated_at`),
    UNIQUE INDEX `seo_guest_publications_business_key_key`(`business_id`, `publication_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_guest_pitches` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `publication_id` VARCHAR(191) NOT NULL,
    `topic_idea` VARCHAR(300) NOT NULL,
    `pitch_subject` VARCHAR(300) NULL,
    `pitch_body` TEXT NULL,
    `source_notes` TEXT NULL,
    `draft_source` VARCHAR(24) NOT NULL DEFAULT 'manual',
    `article_title` VARCHAR(300) NULL,
    `article_body` MEDIUMTEXT NULL,
    `stage` VARCHAR(48) NOT NULL DEFAULT 'topic_idea',
    `submitted_at` DATETIME(3) NULL,
    `decided_at` DATETIME(3) NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `decision_note` TEXT NULL,
    `outreach_sent_at` DATETIME(3) NULL,
    `outreach_send_mode` VARCHAR(24) NULL,
    `response_at` DATETIME(3) NULL,
    `response_status` VARCHAR(32) NULL,
    `response_note` TEXT NULL,
    `published_url` VARCHAR(2048) NULL,
    `published_at` DATETIME(3) NULL,
    `placement_anchor` VARCHAR(1000) NULL,
    `placement_target_url` VARCHAR(2048) NULL,
    `placement_evidence` TEXT NULL,
    `placement_verified_at` DATETIME(3) NULL,
    `placement_verified_by_user_id` VARCHAR(191) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seo_guest_pitches_business_stage_updated_idx`(`business_id`, `stage`, `updated_at`),
    INDEX `seo_guest_pitches_business_publication_stage_idx`(`business_id`, `publication_id`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_guest_posting_audits` (
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

    INDEX `seo_guest_posting_audits_entity_created_idx`(`business_id`, `entity_type`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seo_guest_publications` ADD CONSTRAINT `seo_guest_publications_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_guest_pitches` ADD CONSTRAINT `seo_guest_pitches_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_guest_pitches` ADD CONSTRAINT `seo_guest_pitches_publication_id_fkey` FOREIGN KEY (`publication_id`) REFERENCES `seo_guest_publications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `seo_guest_posting_audits` ADD CONSTRAINT `seo_guest_posting_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
