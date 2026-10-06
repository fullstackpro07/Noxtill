-- CreateTable
CREATE TABLE `legal_consent_records` (
    `id` VARCHAR(191) NOT NULL,
    `consent_id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `region` VARCHAR(40) NULL,
    `policy_version` VARCHAR(20) NOT NULL,
    `categories` JSON NULL,
    `opted_out` BOOLEAN NULL,
    `language` VARCHAR(35) NULL,
    `source` VARCHAR(80) NOT NULL,
    `gpc` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `legal_consent_records_consent_id_created_at_idx`(`consent_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
