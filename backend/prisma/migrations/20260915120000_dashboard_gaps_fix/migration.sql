-- Dashboard "no fabricated data" audit fix-it: three genuine gaps that were previously left as
-- honest placeholders now get real persistence instead — a daily Credit Outstanding balance
-- snapshot (for a real week-over-week delta), a standing daily Business Goal target, and optional
-- per-channel delivery results on Nightly Close logs (for the new Nightly-Close-only multi-channel
-- override, which does not touch the shared `channel_pref` field used by the rest of messaging).

-- CreateTable
CREATE TABLE `credit_balance_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `snapshot_date` DATE NOT NULL,
    `balance` DECIMAL(12, 2) NOT NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_balance_snapshots_business_id_snapshot_date_key`(`business_id`, `snapshot_date`),
    INDEX `credit_balance_snapshots_business_id_snapshot_date_idx`(`business_id`, `snapshot_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_goals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `daily_revenue_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `daily_orders_target` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `business_goals_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `nightly_close_logs` ADD COLUMN `channel_results` JSON NULL;

-- AddForeignKey
ALTER TABLE `credit_balance_snapshots` ADD CONSTRAINT `credit_balance_snapshots_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_goals` ADD CONSTRAINT `business_goals_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
