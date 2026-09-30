CREATE TABLE `commerce_listing_drafts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(64) NOT NULL,
  `market` VARCHAR(100) NULL,
  `language` VARCHAR(16) NOT NULL DEFAULT 'en',
  `brand_voice` TEXT NULL,
  `status` ENUM('draft', 'review_required', 'approved') NOT NULL DEFAULT 'review_required',
  `current_version` INTEGER NOT NULL DEFAULT 1,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `commerce_listing_drafts_business_status_updated_idx` (`business_id`, `status`, `updated_at`),
  INDEX `commerce_listing_drafts_business_product_channel_idx` (`business_id`, `product_id`, `channel`),
  CONSTRAINT `commerce_listing_drafts_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_listing_drafts_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_listing_draft_versions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `draft_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `content` JSON NOT NULL,
  `sources` JSON NOT NULL,
  `generation_method` VARCHAR(24) NOT NULL,
  `change_reason` TEXT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `approved_by_user_id` VARCHAR(191) NULL,
  `approved_at` DATETIME(3) NULL,
  `approval_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `commerce_listing_draft_versions_draft_version_key` (`draft_id`, `version`),
  INDEX `commerce_listing_draft_versions_business_draft_created_idx` (`business_id`, `draft_id`, `created_at`),
  CONSTRAINT `commerce_listing_draft_versions_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_listing_draft_versions_draft_id_fkey`
    FOREIGN KEY (`draft_id`) REFERENCES `commerce_listing_drafts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_listing_draft_audits` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `draft_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `reason` TEXT NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `commerce_listing_draft_audits_business_draft_created_idx` (`business_id`, `draft_id`, `created_at`),
  CONSTRAINT `commerce_listing_draft_audits_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_listing_draft_audits_draft_id_fkey`
    FOREIGN KEY (`draft_id`) REFERENCES `commerce_listing_drafts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
