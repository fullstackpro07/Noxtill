-- E-commerce conflict history depth fix: a real, persisted row per real stock conflict, so
-- Connection Detail has a real browsable log rather than only the latest sync run's outcome.
-- Resolution itself is unchanged (still automatic, most-recently-updated wins).

-- CreateTable
CREATE TABLE `ecommerce_sync_conflicts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer') NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `winner` VARCHAR(191) NOT NULL,
    `local_qty` INTEGER NOT NULL,
    `remote_qty` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ecommerce_sync_conflicts_business_id_provider_created_at_idx`(`business_id`, `provider`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ecommerce_sync_conflicts` ADD CONSTRAINT `ecommerce_sync_conflicts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
