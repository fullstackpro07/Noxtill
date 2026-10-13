-- Voice Consent & Compliance. These are owner-entered policy/evidence records;
-- no jurisdictional rules or external suppression data are seeded here.
CREATE TABLE `voice_compliance_policy_packs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `country_code` CHAR(2) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `caller_type` ENUM('ai_voice', 'live_agent', 'prerecorded') NOT NULL,
    `disabled_at` DATETIME(3) NULL,
    `disabled_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_compliance_policy_region_idx`(`business_id`, `country_code`, `disabled_at`),
    UNIQUE INDEX `voice_compliance_policy_pack_key`(`business_id`, `country_code`, `purpose`, `caller_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_compliance_policy_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `pack_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `ai_disclosure_text` TEXT NOT NULL,
    `recording_allowed` BOOLEAN NOT NULL DEFAULT false,
    `recording_notice_text` TEXT NULL,
    `recording_retention_days` INTEGER NULL,
    `allowed_window_start` VARCHAR(5) NULL,
    `allowed_window_end` VARCHAR(5) NULL,
    `time_zone` VARCHAR(100) NULL,
    `legal_review_reference` VARCHAR(191) NULL,
    `status` ENUM('draft', 'published', 'superseded') NOT NULL DEFAULT 'draft',
    `created_by_user_id` VARCHAR(191) NULL,
    `published_by_user_id` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_compliance_policy_version_status_idx`(`business_id`, `pack_id`, `status`),
    UNIQUE INDEX `voice_compliance_policy_version_key`(`pack_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_consent_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `phone_e164` VARCHAR(16) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `caller_type` ENUM('ai_voice', 'live_agent', 'prerecorded') NULL,
    `source` VARCHAR(40) NOT NULL,
    `notice_text` TEXT NOT NULL,
    `evidence_reference` VARCHAR(500) NOT NULL,
    `legal_basis` VARCHAR(120) NOT NULL,
    `granted_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revocation_reason` VARCHAR(500) NULL,
    `verified_at` DATETIME(3) NOT NULL,
    `verified_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_consent_phone_purpose_idx`(`business_id`, `phone_e164`, `purpose`, `revoked_at`),
    INDEX `voice_consent_verified_idx`(`business_id`, `verified_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_suppression_entries` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `phone_e164` VARCHAR(16) NOT NULL,
    `purpose` VARCHAR(40) NULL,
    `source` VARCHAR(40) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `effective_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by_user_id` VARCHAR(191) NULL,
    `revocation_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_suppression_phone_active_idx`(`business_id`, `phone_e164`, `effective_at`, `revoked_at`),
    INDEX `voice_suppression_business_created_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_outbound_eligibility_decisions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `policy_pack_id` VARCHAR(191) NULL,
    `policy_version_id` VARCHAR(191) NULL,
    `consent_evidence_id` VARCHAR(191) NULL,
    `suppression_entry_id` VARCHAR(191) NULL,
    `phone_e164` VARCHAR(16) NOT NULL,
    `country_code` CHAR(2) NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `caller_type` ENUM('ai_voice', 'live_agent', 'prerecorded') NOT NULL,
    `allowed` BOOLEAN NOT NULL,
    `reason_code` VARCHAR(40) NOT NULL,
    `evaluated_by_user_id` VARCHAR(191) NOT NULL,
    `evaluated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_eligibility_business_allowed_idx`(`business_id`, `allowed`, `evaluated_at`),
    INDEX `voice_eligibility_phone_idx`(`business_id`, `phone_e164`, `evaluated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_compliance_policy_packs` ADD CONSTRAINT `voice_compliance_policy_packs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_compliance_policy_versions` ADD CONSTRAINT `voice_compliance_policy_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_compliance_policy_versions` ADD CONSTRAINT `voice_compliance_policy_versions_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `voice_compliance_policy_packs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `voice_consent_evidence` ADD CONSTRAINT `voice_consent_evidence_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_consent_evidence` ADD CONSTRAINT `voice_consent_evidence_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_suppression_entries` ADD CONSTRAINT `voice_suppression_entries_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_eligibility_decisions` ADD CONSTRAINT `voice_outbound_eligibility_decisions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_eligibility_decisions` ADD CONSTRAINT `voice_outbound_eligibility_decisions_policy_pack_id_fkey` FOREIGN KEY (`policy_pack_id`) REFERENCES `voice_compliance_policy_packs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_eligibility_decisions` ADD CONSTRAINT `voice_outbound_eligibility_decisions_policy_version_id_fkey` FOREIGN KEY (`policy_version_id`) REFERENCES `voice_compliance_policy_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_eligibility_decisions` ADD CONSTRAINT `voice_outbound_eligibility_decisions_consent_evidence_id_fkey` FOREIGN KEY (`consent_evidence_id`) REFERENCES `voice_consent_evidence`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_outbound_eligibility_decisions` ADD CONSTRAINT `voice_outbound_eligibility_decisions_suppression_entry_id_fkey` FOREIGN KEY (`suppression_entry_id`) REFERENCES `voice_suppression_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
