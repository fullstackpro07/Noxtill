-- AI Model Routing spec §5.5: one row per successful routed model call.
CREATE TABLE `ai_usage` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `kind` VARCHAR(64) NOT NULL,
    `operation` VARCHAR(64) NOT NULL,
    `tier` VARCHAR(16) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `tokens_in` INTEGER NOT NULL,
    `tokens_out` INTEGER NOT NULL,
    `cached_in` INTEGER NOT NULL DEFAULT 0,
    `cost_cents` DECIMAL(12, 4) NOT NULL,
    `latency_ms` INTEGER NOT NULL,
    `used_fallback` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_usage_business_created_idx`(`business_id`, `created_at`),
    INDEX `ai_usage_operation_created_idx`(`operation`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
