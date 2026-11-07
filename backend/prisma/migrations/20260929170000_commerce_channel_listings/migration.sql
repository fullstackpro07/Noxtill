CREATE TABLE `commerce_channel_listings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `draft_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer') NOT NULL,
    `external_product_id` VARCHAR(191) NULL,
    `synced_version` INTEGER NULL,
    `selling_price_at_sync` DECIMAL(12, 2) NULL,
    `status` ENUM('pending', 'synced', 'failed') NOT NULL DEFAULT 'pending',
    `last_synced_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `commerce_channel_listings_business_status_updated_idx`(`business_id`, `status`, `updated_at`),
    INDEX `commerce_channel_listings_business_product_provider_idx`(`business_id`, `product_id`, `provider`),
    UNIQUE INDEX `commerce_channel_listings_biz_draft_provider_key`(`business_id`, `draft_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_channel_listings` ADD CONSTRAINT `commerce_channel_listings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_channel_listings` ADD CONSTRAINT `commerce_channel_listings_draft_id_fkey` FOREIGN KEY (`draft_id`) REFERENCES `commerce_listing_drafts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commerce_channel_listings` ADD CONSTRAINT `commerce_channel_listings_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
