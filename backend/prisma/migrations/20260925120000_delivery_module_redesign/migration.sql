-- Delivery module redesign: real per-stage timestamps, cash-handin tracking, ETA padding and a
-- real cash-limit threshold. Every column is nullable (or has a behavior-preserving default), so
-- every row and every existing reader keeps working exactly as before.
ALTER TABLE `deliveries`
    ADD COLUMN `picked_up_at` DATETIME(3) NULL,
    ADD COLUMN `en_route_at` DATETIME(3) NULL;

ALTER TABLE `riders`
    ADD COLUMN `cash_handed_in_at` DATETIME(3) NULL;

ALTER TABLE `delivery_settings`
    ADD COLUMN `eta_padding_minutes` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `cash_limit_amount` DECIMAL(12, 2) NULL;
