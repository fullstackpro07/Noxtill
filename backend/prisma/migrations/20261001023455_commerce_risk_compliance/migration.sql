-- Autonomous Commerce: Risk & Compliance (rules, cases, compliance documents, market eligibility, audit). Hand-extracted; unrelated drift excluded.
-- CreateTable
CREATE TABLE `commerce_risk_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` ENUM('repeat_returns', 'over_returned_order', 'coupon_repeat_use') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `threshold` INTEGER NOT NULL,
    `window_days` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_risk_rules_business_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_risk_cases` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `rule_key` ENUM('repeat_returns', 'over_returned_order', 'coupon_repeat_use') NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `entity_label` VARCHAR(200) NOT NULL,
    `severity` ENUM('low', 'medium', 'high') NOT NULL,
    `status` ENUM('open', 'investigating', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
    `exposure_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `signal_count` INTEGER NOT NULL,
    `evidence` JSON NOT NULL,
    `resolution` TEXT NULL,
    `first_detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_risk_cases_business_status_severity_idx`(`business_id`, `status`, `severity`),
    UNIQUE INDEX `commerce_risk_cases_business_dedupe_key`(`business_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_compliance_documents` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NULL,
    `doc_type` ENUM('certificate', 'test_report', 'license', 'declaration', 'safety_data_sheet', 'other') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `reference` VARCHAR(200) NULL,
    `issuer` VARCHAR(200) NULL,
    `markets` JSON NOT NULL,
    `issued_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_compliance_docs_business_expires_idx`(`business_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_market_eligibility` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `market` VARCHAR(2) NOT NULL,
    `status` ENUM('eligible', 'review_required', 'blocked') NOT NULL,
    `reason` TEXT NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_market_eligibility_biz_product_market_key`(`business_id`, `product_id`, `market`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_risk_audits` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(32) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `reason` TEXT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_risk_audits_biz_entity_created_idx`(`business_id`, `entity_type`, `entity_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE `commerce_risk_rules` ADD CONSTRAINT `commerce_risk_rules_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_risk_cases` ADD CONSTRAINT `commerce_risk_cases_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_compliance_documents` ADD CONSTRAINT `commerce_compliance_documents_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_compliance_documents` ADD CONSTRAINT `commerce_compliance_documents_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `commerce_market_eligibility` ADD CONSTRAINT `commerce_market_eligibility_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `commerce_market_eligibility` ADD CONSTRAINT `commerce_market_eligibility_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_risk_audits` ADD CONSTRAINT `commerce_risk_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
