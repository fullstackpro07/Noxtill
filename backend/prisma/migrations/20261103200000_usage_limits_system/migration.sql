ALTER TABLE `plans` ADD COLUMN `display_order` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `purchasable` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    ADD COLUMN `stripe_yearly_price_id` VARCHAR(191) NULL,
    ADD COLUMN `trial_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `yearly_price` DECIMAL(10, 2) NULL;

CREATE TABLE `plan_entitlements` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `included_quantity` DECIMAL(14, 2) NULL,
    `reset_rule` VARCHAR(16) NOT NULL DEFAULT 'period',

    UNIQUE INDEX `plan_entitlements_plan_id_metric_code_key`(`plan_id`, `metric_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `meter_definitions` (
    `metric_code` VARCHAR(64) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `provider` VARCHAR(32) NULL,
    `reset_rule` VARCHAR(16) NOT NULL DEFAULT 'period',
    `alert_thresholds` JSON NOT NULL,
    `is_billable` BOOLEAN NOT NULL DEFAULT false,
    `enforced` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`metric_code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `meter_prices` (
    `id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `country_code` VARCHAR(8) NOT NULL DEFAULT '',
    `number_type` VARCHAR(16) NOT NULL DEFAULT '',
    `unit_price_usd` DECIMAL(14, 6) NOT NULL,
    `per` INTEGER NOT NULL DEFAULT 1,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `meter_prices_metric_code_country_code_idx`(`metric_code`, `country_code`),
    UNIQUE INDEX `meter_prices_metric_code_country_code_number_type_effective__key`(`metric_code`, `country_code`, `number_type`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `billing_interval` VARCHAR(8) NOT NULL DEFAULT 'month',
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `trial_ends_at` DATETIME(3) NULL,
    `stripe_subscription_id` VARCHAR(191) NULL,
    `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
    `scheduled_plan_id` VARCHAR(191) NULL,
    `scheduled_interval` VARCHAR(8) NULL,
    `past_due_since` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `trial_reminders_sent` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_business_id_key`(`business_id`),
    UNIQUE INDEX `subscriptions_stripe_subscription_id_key`(`stripe_subscription_id`),
    INDEX `subscriptions_status_period_end_idx`(`status`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `credit_balances` (
    `business_id` VARCHAR(191) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `included_quantity` INTEGER NOT NULL,
    `included_used` INTEGER NOT NULL DEFAULT 0,
    `purchased_balance` INTEGER NOT NULL DEFAULT 0,
    `purchased_used` INTEGER NOT NULL DEFAULT 0,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`business_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `allowances` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `included_quantity` DECIMAL(14, 2) NULL,
    `purchased_quantity` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `used_quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `reserved_quantity` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `spent_usd` DECIMAL(14, 6) NOT NULL DEFAULT 0,
    `reserved_usd` DECIMAL(14, 6) NOT NULL DEFAULT 0,

    UNIQUE INDEX `allowances_business_id_metric_code_period_start_key`(`business_id`, `metric_code`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `usage_spend_caps` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `cap_group` VARCHAR(16) NOT NULL,
    `cap_usd` DECIMAL(14, 2) NOT NULL,
    `max_call_minutes` INTEGER NULL,
    `fallback` VARCHAR(24) NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usage_spend_caps_business_id_cap_group_key`(`business_id`, `cap_group`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `usage_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `operation_code` VARCHAR(96) NULL,
    `quantity` DECIMAL(14, 4) NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `cost_usd` DECIMAL(14, 6) NULL,
    `price_usd` DECIMAL(14, 6) NULL,
    `provider` VARCHAR(32) NULL,
    `provider_ref` VARCHAR(191) NULL,
    `country_code` VARCHAR(8) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'completed',
    `idempotency_key` VARCHAR(191) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `usage_events_business_id_metric_code_occurred_at_idx`(`business_id`, `metric_code`, `occurred_at`),
    INDEX `usage_events_business_id_occurred_at_idx`(`business_id`, `occurred_at`),
    UNIQUE INDEX `usage_events_business_id_idempotency_key_key`(`business_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `credit_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `operation_code` VARCHAR(96) NOT NULL,
    `band` VARCHAR(16) NOT NULL,
    `reserved_qty` INTEGER NOT NULL,
    `actual_qty` INTEGER NULL,
    `included_part` INTEGER NOT NULL DEFAULT 0,
    `purchased_part` INTEGER NOT NULL DEFAULT 0,
    `bucket` VARCHAR(16) NULL,
    `state` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `reserved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `settled_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `credit_ledger_state_expires_at_idx`(`state`, `expires_at`),
    INDEX `credit_ledger_business_id_reserved_at_idx`(`business_id`, `reserved_at`),
    UNIQUE INDEX `credit_ledger_business_id_idempotency_key_key`(`business_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `capacity_purchases` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price_usd` DECIMAL(10, 2) NOT NULL,
    `recurring` BOOLEAN NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `stripe_checkout_id` VARCHAR(191) NULL,
    `stripe_item_id` VARCHAR(191) NULL,
    `active_from` DATETIME(3) NULL,
    `active_to` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `capacity_purchases_stripe_checkout_id_key`(`stripe_checkout_id`),
    INDEX `capacity_purchases_business_id_metric_code_status_idx`(`business_id`, `metric_code`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `usage_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `threshold` INTEGER NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `channels` JSON NOT NULL,

    UNIQUE INDEX `usage_alerts_business_id_metric_code_threshold_period_start_key`(`business_id`, `metric_code`, `threshold`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `entitlement_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `actor_type` VARCHAR(16) NOT NULL,
    `change_type` VARCHAR(24) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `entitlement_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `usage_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `type` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_at` DATETIME(3) NULL,

    INDEX `usage_outbox_published_at_created_at_idx`(`published_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provider_costs` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `country_code` VARCHAR(8) NOT NULL DEFAULT '',
    `number_type` VARCHAR(16) NOT NULL DEFAULT '',
    `unit_cost_usd` DECIMAL(14, 6) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `fetched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(8) NOT NULL,

    INDEX `provider_costs_provider_metric_code_country_code_fetched_at_idx`(`provider`, `metric_code`, `country_code`, `fetched_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provider_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `line_item` VARCHAR(96) NOT NULL,
    `provider_quantity` DECIMAL(14, 4) NOT NULL,
    `provider_cost_usd` DECIMAL(14, 6) NOT NULL,
    `our_quantity` DECIMAL(14, 4) NOT NULL,
    `our_cost_usd` DECIMAL(14, 6) NOT NULL,
    `variance_pct` DECIMAL(8, 2) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `provider_invoices_provider_line_item_period_start_key`(`provider`, `line_item`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stripe_event_log` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_payment_methods` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `stripe_payment_method_id` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(32) NOT NULL,
    `last4` VARCHAR(4) NOT NULL,
    `exp_month` INTEGER NOT NULL,
    `exp_year` INTEGER NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `platform_payment_methods_stripe_payment_method_id_key`(`stripe_payment_method_id`),
    INDEX `platform_payment_methods_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `plans_stripe_yearly_price_id_key` ON `plans`(`stripe_yearly_price_id`);

ALTER TABLE `plan_entitlements` ADD CONSTRAINT `plan_entitlements_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_scheduled_plan_id_fkey` FOREIGN KEY (`scheduled_plan_id`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
