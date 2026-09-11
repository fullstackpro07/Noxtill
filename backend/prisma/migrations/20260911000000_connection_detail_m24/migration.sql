-- Connection Detail depth fix (UPD-BE-132): a real generic per-connector detail view needs real
-- connected-since/last-sync timestamps (neither existed on `integrations` before) and a real,
-- generic sync-activity log for Accounting/E-commerce (Business Listings already has its own
-- `listing_sync_logs`, reused rather than duplicated).

-- AlterTable
ALTER TABLE `integrations` ADD COLUMN `connected_at` DATETIME(3) NULL;
ALTER TABLE `integrations` ADD COLUMN `last_sync_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `integration_sync_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer') NOT NULL,
    `success` BOOLEAN NOT NULL,
    `records_processed` INTEGER NOT NULL DEFAULT 0,
    `message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `integration_sync_logs_business_id_provider_created_at_idx`(`business_id`, `provider`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `integration_sync_logs` ADD CONSTRAINT `integration_sync_logs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
