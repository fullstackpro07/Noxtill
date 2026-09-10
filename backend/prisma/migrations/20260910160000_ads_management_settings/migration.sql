-- Campaign management actions (UPD-BE-130) + Advertising Settings (UPD-BE-131): a real pause/
-- resume/budget-adjust path per provider needs the account-selection context persisted from
-- creation time, and a real business-level settings row to drive default budget caps / auto-pause
-- rules / approval requirement.

-- AlterTable
ALTER TABLE `ad_campaigns` ADD COLUMN `provider_meta` JSON NOT NULL DEFAULT (JSON_OBJECT());

-- CreateTable
CREATE TABLE `ad_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `default_daily_budget_cap` DECIMAL(12, 2) NULL,
    `auto_pause_cost_per_result` DECIMAL(12, 2) NULL,
    `require_approval` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ad_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ad_settings` ADD CONSTRAINT `ad_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
