-- Voice Quality Intelligence: versioned human rubrics and evidence-linked reviews.
-- 9 statements: 3 owned tables and their 6 foreign keys. Unrelated local drift is excluded.
CREATE TABLE `voice_quality_rubrics` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_quality_rubrics_business_active_idx`(`business_id`, `active`),
    UNIQUE INDEX `voice_quality_rubrics_business_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_quality_rubric_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `rubric_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `criteria` JSON NOT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_quality_rubric_versions_business_published_idx`(`business_id`, `rubric_id`, `published_at`),
    UNIQUE INDEX `voice_quality_rubric_versions_rubric_version_key`(`rubric_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_quality_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `call_id` VARCHAR(191) NOT NULL,
    `rubric_version_id` VARCHAR(191) NOT NULL,
    `status` ENUM('assigned', 'in_progress', 'submitted', 'overridden') NOT NULL DEFAULT 'assigned',
    `assigned_to_user_id` VARCHAR(191) NULL,
    `reviewer_user_id` VARCHAR(191) NULL,
    `criteria_scores` JSON NOT NULL,
    `computed_score` INTEGER NULL,
    `override_score` INTEGER NULL,
    `override_reason` TEXT NULL,
    `overridden_by_user_id` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_quality_reviews_business_status_idx`(`business_id`, `status`, `created_at`),
    INDEX `voice_quality_reviews_business_assignee_idx`(`business_id`, `assigned_to_user_id`, `status`),
    UNIQUE INDEX `voice_quality_reviews_call_rubric_version_key`(`call_id`, `rubric_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_quality_rubrics` ADD CONSTRAINT `voice_quality_rubrics_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_quality_rubric_versions` ADD CONSTRAINT `voice_quality_rubric_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_quality_rubric_versions` ADD CONSTRAINT `voice_quality_rubric_versions_rubric_id_fkey` FOREIGN KEY (`rubric_id`) REFERENCES `voice_quality_rubrics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voice_quality_reviews` ADD CONSTRAINT `voice_quality_reviews_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_quality_reviews` ADD CONSTRAINT `voice_quality_reviews_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voice_quality_reviews` ADD CONSTRAINT `voice_quality_reviews_rubric_version_id_fkey` FOREIGN KEY (`rubric_version_id`) REFERENCES `voice_quality_rubric_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
