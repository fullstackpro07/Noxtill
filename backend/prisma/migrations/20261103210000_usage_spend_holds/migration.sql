-- Usage & Limits: spend-cap holds (replaces the unused stripe_event_log table — Stripe webhook
-- idempotency is already handled by WebhookIdempotencyService on the event id).
DROP TABLE `stripe_event_log`;

CREATE TABLE `spend_holds` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `cap_group` VARCHAR(16) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `allowance_id` VARCHAR(191) NOT NULL,
    `amount_usd` DECIMAL(14, 6) NOT NULL,
    `actual_usd` DECIMAL(14, 6) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `state` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `settled_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `spend_holds_state_expires_at_idx`(`state`, `expires_at`),
    UNIQUE INDEX `spend_holds_business_id_idempotency_key_key`(`business_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
