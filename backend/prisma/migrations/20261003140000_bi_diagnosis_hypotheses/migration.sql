CREATE TABLE `bi_diagnosis_hypotheses` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `insight_id` VARCHAR(191) NOT NULL,
    `hypothesis` TEXT NOT NULL,
    `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    `resolution_note` VARCHAR(500) NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `resolved_by_user_id` VARCHAR(191) NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `bi_diagnosis_hypotheses_business_status_created_idx` (`business_id`, `status`, `created_at`),
    INDEX `bi_diagnosis_hypotheses_business_insight_idx` (`business_id`, `insight_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bi_diagnosis_hypotheses` ADD CONSTRAINT `bi_diagnosis_hypotheses_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `bi_diagnosis_hypotheses` ADD CONSTRAINT `bi_diagnosis_hypotheses_insight_id_fkey` FOREIGN KEY (`insight_id`) REFERENCES `ai_insights`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
