CREATE TABLE `voice_billing_rate_versions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `source_version` VARCHAR(80) NOT NULL,
  `source_reference` VARCHAR(500) NOT NULL,
  `source_hash` VARCHAR(64) NOT NULL,
  `currency` VARCHAR(3) NOT NULL,
  `currency_minor_units` INTEGER NOT NULL,
  `rates` JSON NOT NULL,
  `effective_from` DATETIME(3) NOT NULL,
  `approved_at` DATETIME(3) NULL,
  `approved_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_billing_rates_business_version_key` (`business_id`, `version`),
  UNIQUE INDEX `voice_billing_rates_business_source_key` (`business_id`, `source_version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_billing_drafts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `rate_version_id` VARCHAR(191) NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `currency` VARCHAR(3) NOT NULL,
  `currency_minor_units` INTEGER NOT NULL,
  `total` DECIMAL(18,6) NOT NULL,
  `evidence_hash` VARCHAR(64) NOT NULL,
  `item_count` INTEGER NOT NULL,
  `items` JSON NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `approved_by_user_id` VARCHAR(191) NULL,
  `approved_at` DATETIME(3) NULL,
  `decision_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `voice_billing_drafts_business_period_idx` (`business_id`, `period_start`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_billing_usage_claims` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `draft_id` VARCHAR(191) NOT NULL,
  `usage_record_id` VARCHAR(191) NOT NULL,
  `snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_billing_claims_usage_key` (`usage_record_id`),
  INDEX `voice_billing_claims_business_draft_idx` (`business_id`, `draft_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_billing_rate_versions`
  ADD CONSTRAINT `voice_billing_rate_versions_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_billing_drafts`
  ADD CONSTRAINT `voice_billing_drafts_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_billing_drafts`
  ADD CONSTRAINT `voice_billing_drafts_rate_version_id_fkey`
  FOREIGN KEY (`rate_version_id`) REFERENCES `voice_billing_rate_versions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_billing_usage_claims`
  ADD CONSTRAINT `voice_billing_usage_claims_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_billing_usage_claims`
  ADD CONSTRAINT `voice_billing_usage_claims_draft_id_fkey`
  FOREIGN KEY (`draft_id`) REFERENCES `voice_billing_drafts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_billing_usage_claims`
  ADD CONSTRAINT `voice_billing_usage_claims_usage_record_id_fkey`
  FOREIGN KEY (`usage_record_id`) REFERENCES `voice_usage_records` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
