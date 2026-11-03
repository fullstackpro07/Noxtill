CREATE TABLE `commerce_agent_tool_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `tool_key` VARCHAR(64) NOT NULL,
    `risk_class` VARCHAR(24) NOT NULL,
    `actor_type` VARCHAR(16) NOT NULL DEFAULT 'user',
    `actor_user_id` VARCHAR(191) NULL,
    `autonomy_level` INTEGER NOT NULL,
    `input` JSON NOT NULL,
    `outcome` VARCHAR(16) NOT NULL,
    `refusal_reason` TEXT NULL,
    `result_summary` TEXT NULL,
    `correlation_id` VARCHAR(64) NOT NULL,
    `duration_ms` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_agent_tool_runs_business_created_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_agent_tool_runs` ADD CONSTRAINT `commerce_agent_tool_runs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
