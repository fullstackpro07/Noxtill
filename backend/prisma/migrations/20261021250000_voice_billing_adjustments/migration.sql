-- Credits against usage drafts already sent to Stripe (negative invoice items, posted once).
CREATE TABLE `voice_billing_adjustments` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `draft_id` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(18, 6) NOT NULL,
  `currency` VARCHAR(3) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `provider_invoice_item_id` VARCHAR(64) NULL,
  `post_error` VARCHAR(300) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `posted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `voice_billing_adjustments_draft_idx`(`business_id`, `draft_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
