-- Integrations redesign: new providers, pause state, sync-log depth, e-commerce conflict queue,
-- per-order accounting failure detail, booking meeting/calendar ids, usage counters, advisor
-- dismissals, integration requests, and the records the new inbound connectors write.

ALTER TABLE `accounting_mappings` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `ad_audiences` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `ad_campaigns` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `ad_creatives` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `ad_leads` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `citations` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `ecommerce_sync_conflicts` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `integration_sync_logs` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `integrations` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `listing_sync_logs` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `outbound_webhooks` MODIFY COLUMN `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL;
ALTER TABLE `orders` MODIFY COLUMN `external_provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NULL;

ALTER TABLE `integrations` ADD COLUMN `paused_at` DATETIME(3) NULL;
ALTER TABLE `integration_sync_logs`
    ADD COLUMN `records_failed` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `duration_ms` INTEGER NULL,
    ADD COLUMN `details` JSON NULL;
ALTER TABLE `ecommerce_sync_conflicts`
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'auto',
    ADD COLUMN `product_id` VARCHAR(191) NULL,
    ADD COLUMN `product_name` VARCHAR(191) NULL,
    ADD COLUMN `local_updated_at` DATETIME(3) NULL,
    ADD COLUMN `remote_updated_at` DATETIME(3) NULL,
    ADD COLUMN `resolution` VARCHAR(191) NULL,
    ADD COLUMN `resolved_qty` INTEGER NULL,
    ADD COLUMN `resolved_at` DATETIME(3) NULL,
    ADD COLUMN `resolved_by_user_id` VARCHAR(191) NULL;
CREATE INDEX `ecommerce_sync_conflicts_business_id_status_idx` ON `ecommerce_sync_conflicts`(`business_id`, `status`);
ALTER TABLE `orders`
    ADD COLUMN `accounting_sync_error` VARCHAR(500) NULL,
    ADD COLUMN `accounting_sync_attempted_at` DATETIME(3) NULL;
ALTER TABLE `appointments`
    ADD COLUMN `meeting_url` VARCHAR(500) NULL,
    ADD COLUMN `calendar_event_ids` JSON NULL;

CREATE TABLE `api_key_usage_hours` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `api_key_id` VARCHAR(191) NOT NULL,
    `bucket_start` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `api_key_usage_hours_api_key_id_bucket_start_key`(`api_key_id`, `bucket_start`),
    INDEX `api_key_usage_hours_business_id_bucket_start_idx`(`business_id`, `bucket_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `integration_advisor_dismissals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `finding_key` VARCHAR(191) NOT NULL,
    `until` DATETIME(3) NOT NULL,
    `dismissed_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `integration_advisor_dismissals_business_id_finding_key_key`(`business_id`, `finding_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `integration_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider_name` VARCHAR(191) NOT NULL,
    `provider_key` VARCHAR(191) NOT NULL,
    `use_case` TEXT NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `requested_by_user_id` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `integration_requests_provider_key_idx`(`provider_key`),
    INDEX `integration_requests_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `external_payments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL,
    `external_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `external_payments_business_id_provider_external_id_key`(`business_id`, `provider`, `external_id`),
    INDEX `external_payments_business_id_provider_occurred_at_idx`(`business_id`, `provider`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `web_traffic_daily` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` ENUM('email','gmb','google_ads','merchant','meta_ads','tiktok_ads','bing_places','apple_business_connect','yelp','linkedin_ads','pinterest_ads','snapchat_ads','microsoft_ads','amazon_ads','reddit_ads','quickbooks','xero','shopify','woocommerce','zapier','make','n8n','developer','google_analytics','google_calendar','whatsapp','outlook','stripe','paypal','square','mailchimp','klaviyo','slack','zoom') NOT NULL,
    `day` DATE NOT NULL,
    `sessions` INTEGER NOT NULL DEFAULT 0,
    `conversions` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `web_traffic_daily_business_id_provider_day_key`(`business_id`, `provider`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

