-- Delivery module: real fee/cost snapshot, customer-notification record, public tracking token,
-- rider location consent, dispatch hub + cost model, real automation switches and run log.
ALTER TABLE `riders`
    ADD COLUMN `share_location_consent` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `deliveries`
    ADD COLUMN `delivery_fee` DECIMAL(12, 2) NULL,
    ADD COLUMN `delivery_cost` DECIMAL(12, 2) NULL,
    ADD COLUMN `distance_km` DECIMAL(8, 2) NULL,
    ADD COLUMN `delivery_note` TEXT NULL,
    ADD COLUMN `tracking_token` VARCHAR(191) NULL,
    ADD COLUMN `notified_promised_at` DATETIME(3) NULL,
    ADD COLUMN `customer_notified_at` DATETIME(3) NULL,
    ADD COLUMN `slip_notified_at` DATETIME(3) NULL,
    ADD UNIQUE INDEX `deliveries_tracking_token_key`(`tracking_token`);

ALTER TABLE `delivery_settings`
    ADD COLUMN `hub_lat` DECIMAL(9, 6) NULL,
    ADD COLUMN `hub_lng` DECIMAL(9, 6) NULL,
    ADD COLUMN `cost_per_km` DECIMAL(10, 2) NULL,
    ADD COLUMN `rider_pay_per_delivery` DECIMAL(10, 2) NULL,
    ADD COLUMN `auto_eta_on_assign` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `auto_eta_on_slip` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `slip_threshold_minutes` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `auto_flag_stale_phone` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `auto_warn_cash_limit` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `auto_task_on_failure` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `send_proof_to_customer` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `share_live_location` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `enforce_zone_coverage` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `show_fee_before_checkout` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `paused_zones_block_orders` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `delivery_automation_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `rule` VARCHAR(191) NOT NULL,
    `delivery_id` VARCHAR(191) NULL,
    `rider_id` VARCHAR(191) NULL,
    `detail` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `delivery_automation_runs_business_id_rule_created_at_idx`(`business_id`, `rule`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `delivery_automation_runs` ADD CONSTRAINT `delivery_automation_runs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
