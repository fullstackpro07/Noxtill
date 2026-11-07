CREATE TABLE `commerce_reconciliation_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer') NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `listings_checked` INTEGER NOT NULL DEFAULT 0,
    `discrepancies` INTEGER NOT NULL DEFAULT 0,
    `detail` TEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,

    INDEX `commerce_recon_runs_business_started_idx`(`business_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_reconciliation_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `channel_listing_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer') NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `local` JSON NOT NULL,
    `remote` JSON NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `resolution_note` TEXT NULL,
    `resolved_by_user_id` VARCHAR(191) NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_recon_items_business_status_created_idx`(`business_id`, `status`, `created_at`),
    INDEX `commerce_recon_items_run_idx`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_reconciliation_runs` ADD CONSTRAINT `commerce_reconciliation_runs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_reconciliation_items` ADD CONSTRAINT `commerce_reconciliation_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `commerce_reconciliation_items` ADD CONSTRAINT `commerce_reconciliation_items_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `commerce_reconciliation_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
