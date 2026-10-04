-- AlterTable
ALTER TABLE `orders` MODIFY `external_provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NULL;

-- AlterTable
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'finance_approval', 'payment_approval', 'payment_dispute_due') NOT NULL;

-- AlterTable
ALTER TABLE `integrations` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `integration_sync_logs` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `ecommerce_sync_conflicts` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `ad_campaigns` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `ad_creatives` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `ad_audiences` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `ad_leads` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `accounting_mappings` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `outbound_webhooks` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `listing_sync_logs` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `citations` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `external_payments` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- AlterTable
ALTER TABLE `web_traffic_daily` MODIFY `provider` ENUM('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads', 'bing_places', 'apple_business_connect', 'yelp', 'linkedin_ads', 'pinterest_ads', 'snapchat_ads', 'microsoft_ads', 'amazon_ads', 'reddit_ads', 'quickbooks', 'xero', 'shopify', 'woocommerce', 'zapier', 'make', 'n8n', 'developer', 'google_analytics', 'google_calendar', 'whatsapp', 'outlook', 'stripe', 'stripe_test', 'paypal', 'square', 'mailchimp', 'klaviyo', 'slack', 'zoom') NOT NULL;

-- CreateTable
CREATE TABLE `pay_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `policy` JSON NOT NULL,
    `policy_version` INTEGER NOT NULL DEFAULT 1,
    `tx_seq` INTEGER NOT NULL DEFAULT 0,
    `request_seq` INTEGER NOT NULL DEFAULT 0,
    `refund_seq` INTEGER NOT NULL DEFAULT 0,
    `rule_seq` INTEGER NOT NULL DEFAULT 0,
    `projected_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_policy_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `policy` JSON NOT NULL,
    `changed` JSON NOT NULL,
    `reason` VARCHAR(500) NULL,
    `high_risk` BOOLEAN NOT NULL DEFAULT false,
    `by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_policy_versions_business_id_version_key`(`business_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_connections` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(12) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `integration_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(64) NULL,
    `status` VARCHAR(20) NOT NULL,
    `write_enabled` BOOLEAN NOT NULL DEFAULT false,
    `caps` JSON NOT NULL,
    `sync_state` JSON NOT NULL,
    `last_event_at` DATETIME(3) NULL,
    `last_error_code` VARCHAR(40) NULL,
    `last_error_at` DATETIME(3) NULL,
    `payout_schedule` VARCHAR(80) NULL,
    `destination` VARCHAR(80) NULL,
    `default_currency` VARCHAR(3) NULL,
    `country` VARCHAR(2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pay_connections_account_id_idx`(`account_id`),
    UNIQUE INDEX `pay_connections_business_id_provider_env_key`(`business_id`, `provider`, `env`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `env` VARCHAR(4) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `origin` VARCHAR(8) NOT NULL,
    `source_key` VARCHAR(120) NOT NULL,
    `source_type` VARCHAR(20) NOT NULL,
    `source_id` VARCHAR(191) NULL,
    `source_ref` VARCHAR(60) NULL,
    `payment_id` VARCHAR(191) NULL,
    `order_id` VARCHAR(191) NULL,
    `deposit_id` VARCHAR(191) NULL,
    `customer_id` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NULL,
    `mandate_id` VARCHAR(191) NULL,
    `provider` VARCHAR(12) NOT NULL,
    `connection_id` VARCHAR(191) NULL,
    `channel` VARCHAR(20) NOT NULL,
    `method` VARCHAR(20) NOT NULL,
    `method_brand` VARCHAR(20) NULL,
    `method_last4` VARCHAR(4) NULL,
    `status` VARCHAR(24) NOT NULL,
    `auth_status` VARCHAR(16) NOT NULL,
    `capture_status` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `captured` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `refunded` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `disputed` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `fee` DECIMAL(14, 2) NULL,
    `fee_source` VARCHAR(8) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `fx_rate` DECIMAL(18, 8) NULL,
    `fx_source` VARCHAR(80) NULL,
    `report_amount` DECIMAL(14, 2) NULL,
    `provider_intent_id` VARCHAR(80) NULL,
    `provider_charge_id` VARCHAR(80) NULL,
    `payout_ref` VARCHAR(80) NULL,
    `failure_code` VARCHAR(80) NULL,
    `failure_message` VARCHAR(300) NULL,
    `failure_category` VARCHAR(40) NULL,
    `risk_outcome` VARCHAR(40) NULL,
    `correlation_id` VARCHAR(40) NOT NULL,
    `idempotency_key` VARCHAR(120) NULL,
    `initiated_by` VARCHAR(120) NOT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `authorized_at` DATETIME(3) NULL,
    `captured_at` DATETIME(3) NULL,
    `auth_expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_transactions_payment_id_key`(`payment_id`),
    INDEX `pay_transactions_business_id_env_occurred_at_idx`(`business_id`, `env`, `occurred_at`),
    INDEX `pay_transactions_business_id_env_status_idx`(`business_id`, `env`, `status`),
    INDEX `pay_transactions_provider_charge_id_idx`(`provider_charge_id`),
    INDEX `pay_transactions_provider_intent_id_idx`(`provider_intent_id`),
    INDEX `pay_transactions_order_id_idx`(`order_id`),
    INDEX `pay_transactions_customer_id_idx`(`customer_id`),
    INDEX `pay_transactions_request_id_idx`(`request_id`),
    UNIQUE INDEX `pay_transactions_business_id_source_key_key`(`business_id`, `source_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `provider` VARCHAR(16) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `external_id` VARCHAR(120) NOT NULL,
    `account_id` VARCHAR(64) NULL,
    `type` VARCHAR(80) NOT NULL,
    `tx_id` VARCHAR(191) NULL,
    `ref_type` VARCHAR(20) NULL,
    `ref_id` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `signature` VARCHAR(16) NOT NULL,
    `processing` VARCHAR(20) NOT NULL,
    `error` VARCHAR(300) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_events_business_id_tx_id_idx`(`business_id`, `tx_id`),
    INDEX `pay_events_business_id_received_at_idx`(`business_id`, `received_at`),
    UNIQUE INDEX `pay_events_provider_external_id_key`(`provider`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_idempotency` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(160) NOT NULL,
    `op` VARCHAR(40) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `provider_object_id` VARCHAR(80) NULL,
    `result` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_idempotency_key_key`(`key`),
    INDEX `pay_idempotency_business_id_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `env` VARCHAR(4) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `recipient_name` VARCHAR(160) NOT NULL,
    `contact` VARCHAR(10) NOT NULL,
    `link_type` VARCHAR(16) NULL,
    `link_id` VARCHAR(191) NULL,
    `link_ref` VARCHAR(60) NULL,
    `amount_type` VARCHAR(8) NOT NULL,
    `amount` DECIMAL(14, 2) NULL,
    `allow_partial` BOOLEAN NOT NULL DEFAULT false,
    `currency` VARCHAR(3) NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `reference` VARCHAR(120) NULL,
    `due_on` DATE NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `methods` JSON NOT NULL,
    `note` VARCHAR(1000) NULL,
    `redirect_url` VARCHAR(300) NULL,
    `status` VARCHAR(16) NOT NULL,
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `last_viewed_at` DATETIME(3) NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `token_nonce` VARCHAR(32) NOT NULL,
    `template` VARCHAR(20) NULL,
    `checkout_session_id` VARCHAR(120) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_requests_token_hash_key`(`token_hash`),
    INDEX `pay_requests_business_id_env_status_idx`(`business_id`, `env`, `status`),
    INDEX `pay_requests_business_id_link_type_link_id_idx`(`business_id`, `link_type`, `link_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_request_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(40) NOT NULL,
    `message_id` VARCHAR(191) NULL,
    `conversation_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL,
    `error` VARCHAR(300) NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_request_deliveries_business_id_request_id_idx`(`business_id`, `request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_recovery_cases` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `tx_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `category` VARCHAR(40) NOT NULL,
    `raw_code` VARCHAR(80) NOT NULL,
    `recoverability` VARCHAR(16) NOT NULL,
    `guidance` VARCHAR(200) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `next_retry_at` DATETIME(3) NULL,
    `status` VARCHAR(24) NOT NULL,
    `owner_id` VARCHAR(191) NULL,
    `notified_at` DATETIME(3) NULL,
    `notify_channel` VARCHAR(12) NULL,
    `retryable` BOOLEAN NOT NULL DEFAULT false,
    `recovered_tx_id` VARCHAR(191) NULL,
    `first_failed_at` DATETIME(3) NOT NULL,
    `last_attempt_at` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_recovery_cases_tx_id_key`(`tx_id`),
    INDEX `pay_recovery_cases_business_id_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_refunds` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `return_id` VARCHAR(191) NULL,
    `tx_id` VARCHAR(191) NULL,
    `origin` VARCHAR(8) NOT NULL,
    `approved_amount` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `method` VARCHAR(20) NOT NULL,
    `upstream_by_id` VARCHAR(191) NULL,
    `upstream_at` DATETIME(3) NULL,
    `approval_id` VARCHAR(191) NULL,
    `provider_refund_id` VARCHAR(80) NULL,
    `idempotency_key` VARCHAR(120) NOT NULL,
    `failure_code` VARCHAR(80) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `submitted_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `executed_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_refunds_return_id_key`(`return_id`),
    UNIQUE INDEX `pay_refunds_provider_refund_id_key`(`provider_refund_id`),
    INDEX `pay_refunds_business_id_status_idx`(`business_id`, `status`),
    INDEX `pay_refunds_tx_id_idx`(`tx_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_disputes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `provider_dispute_id` VARCHAR(80) NOT NULL,
    `tx_id` VARCHAR(191) NULL,
    `provider_charge_id` VARCHAR(80) NULL,
    `reason` VARCHAR(80) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `fee` DECIMAL(14, 2) NULL,
    `due_by` DATETIME(3) NULL,
    `charge_refundable` BOOLEAN NOT NULL DEFAULT false,
    `owner_id` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approval_id` VARCHAR(191) NULL,
    `outcome` VARCHAR(20) NULL,
    `draft` TEXT NULL,
    `response` TEXT NULL,
    `opened_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_disputes_provider_dispute_id_key`(`provider_dispute_id`),
    INDEX `pay_disputes_business_id_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_dispute_evidence` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `dispute_id` VARCHAR(191) NOT NULL,
    `module` VARCHAR(30) NOT NULL,
    `entity_type` VARCHAR(30) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `entity_ref` VARCHAR(60) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `requirement` VARCHAR(12) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `field` VARCHAR(40) NULL,
    `content` TEXT NULL,
    `added_by_id` VARCHAR(191) NULL,
    `added_at` DATETIME(3) NULL,

    INDEX `pay_dispute_evidence_business_id_dispute_id_idx`(`business_id`, `dispute_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_payouts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `provider_payout_id` VARCHAR(80) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `arrival_date` DATE NULL,
    `provider_created_at` DATETIME(3) NOT NULL,
    `destination` VARCHAR(80) NULL,
    `automatic` BOOLEAN NOT NULL DEFAULT true,
    `failure_code` VARCHAR(80) NULL,
    `external_payment_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_payouts_provider_payout_id_key`(`provider_payout_id`),
    INDEX `pay_payouts_business_id_env_status_idx`(`business_id`, `env`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_balance_txns` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `provider_txn_id` VARCHAR(80) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `category` VARCHAR(40) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `fee` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `net` DECIMAL(14, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `available_on` DATETIME(3) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `source_object_id` VARCHAR(80) NULL,
    `payout_ref` VARCHAR(80) NULL,
    `tx_id` VARCHAR(191) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_balance_txns_provider_txn_id_key`(`provider_txn_id`),
    INDEX `pay_balance_txns_business_id_env_occurred_at_idx`(`business_id`, `env`, `occurred_at`),
    INDEX `pay_balance_txns_payout_ref_idx`(`payout_ref`),
    INDEX `pay_balance_txns_source_object_id_idx`(`source_object_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_balance_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `available` JSON NOT NULL,
    `pending` JSON NOT NULL,
    `reserved` JSON NULL,
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_balance_snapshots_connection_id_fetched_at_idx`(`connection_id`, `fetched_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_mandates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `source_module` VARCHAR(24) NOT NULL,
    `membership_id` VARCHAR(191) NULL,
    `installment_plan_id` VARCHAR(191) NULL,
    `customer_id` VARCHAR(191) NULL,
    `plan_name` VARCHAR(160) NOT NULL,
    `plan_ref` VARCHAR(60) NOT NULL,
    `plan_status` VARCHAR(16) NOT NULL,
    `provider` VARCHAR(12) NOT NULL,
    `connection_id` VARCHAR(191) NULL,
    `provider_subscription_id` VARCHAR(80) NULL,
    `provider_customer_id` VARCHAR(80) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `frequency` VARCHAR(10) NOT NULL,
    `next_charge_at` DATETIME(3) NULL,
    `last_charge_at` DATETIME(3) NULL,
    `status` VARCHAR(12) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `legacy_platform` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_mandates_membership_id_key`(`membership_id`),
    UNIQUE INDEX `pay_mandates_installment_plan_id_key`(`installment_plan_id`),
    INDEX `pay_mandates_business_id_env_status_idx`(`business_id`, `env`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_mandate_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `mandate_id` VARCHAR(191) NOT NULL,
    `tx_id` VARCHAR(191) NULL,
    `provider_invoice_id` VARCHAR(80) NULL,
    `due_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `failure_code` VARCHAR(80) NULL,
    `idem_key` VARCHAR(120) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_mandate_attempts_provider_invoice_id_key`(`provider_invoice_id`),
    INDEX `pay_mandate_attempts_business_id_due_at_idx`(`business_id`, `due_at`),
    UNIQUE INDEX `pay_mandate_attempts_mandate_id_idem_key_key`(`mandate_id`, `idem_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_provider_customers` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `provider_customer_id` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_provider_customers_connection_id_customer_id_key`(`connection_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_plan_prices` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `membership_plan_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(80) NOT NULL,
    `price_id` VARCHAR(80) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `interval` VARCHAR(8) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_plan_prices_connection_id_membership_plan_id_amount_inte_key`(`connection_id`, `membership_plan_id`, `amount`, `interval`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_method_configs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `method` VARCHAR(24) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `channels` JSON NOT NULL,
    `primary` VARCHAR(12) NULL,
    `fallback` VARCHAR(12) NULL,
    `min_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `max_amount` DECIMAL(14, 2) NOT NULL,
    `risk_policy` VARCHAR(160) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_method_configs_business_id_method_key`(`business_id`, `method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_routing_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `level` VARCHAR(20) NOT NULL,
    `priority` INTEGER NOT NULL,
    `conditions` JSON NOT NULL,
    `method` VARCHAR(24) NOT NULL,
    `primary` VARCHAR(12) NOT NULL,
    `fallback` VARCHAR(12) NULL,
    `status` VARCHAR(10) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pay_routing_rules_business_id_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_routing_rule_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `rule_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `by_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(300) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_routing_rule_versions_rule_id_version_key`(`rule_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_recon_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `connection_id` VARCHAR(191) NOT NULL,
    `env` VARCHAR(4) NOT NULL,
    `batch_ref` VARCHAR(80) NULL,
    `provider_ref` VARCHAR(80) NOT NULL,
    `balance_txn_id` VARCHAR(191) NULL,
    `tx_id` VARCHAR(191) NULL,
    `type` VARCHAR(20) NOT NULL,
    `provider_gross` DECIMAL(14, 2) NULL,
    `noxtill_gross` DECIMAL(14, 2) NULL,
    `provider_fee` DECIMAL(14, 2) NULL,
    `noxtill_fee` DECIMAL(14, 2) NULL,
    `currency` VARCHAR(3) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `match_method` VARCHAR(20) NULL,
    `confidence` VARCHAR(8) NULL,
    `candidate_tx_id` VARCHAR(191) NULL,
    `suggestion_why` VARCHAR(300) NULL,
    `split_tx_ids` JSON NULL,
    `note` VARCHAR(300) NULL,
    `resolution` VARCHAR(300) NULL,
    `resolved_by_id` VARCHAR(191) NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pay_recon_items_balance_txn_id_key`(`balance_txn_id`),
    INDEX `pay_recon_items_business_id_env_status_idx`(`business_id`, `env`, `status`),
    INDEX `pay_recon_items_tx_id_idx`(`tx_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_recon_resolutions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `by_id` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_recon_resolutions_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(14, 2) NULL,
    `rule` VARCHAR(200) NOT NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `decided_by_id` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `comment` VARCHAR(500) NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pay_approvals_business_id_status_idx`(`business_id`, `status`),
    INDEX `pay_approvals_kind_subject_id_idx`(`kind`, `subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(120) NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(500) NOT NULL,
    `corr` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `pay_audit_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `event` VARCHAR(60) NOT NULL,
    `payload` JSON NOT NULL,
    `consumers` JSON NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pay_outbox_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pay_saved_views` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `filters` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pay_saved_views_business_id_user_id_name_key`(`business_id`, `user_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

