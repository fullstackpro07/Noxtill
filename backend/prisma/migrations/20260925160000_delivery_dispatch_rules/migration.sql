-- Delivery: owner-configurable auto-assign and queue-priority rules (defaults preserve existing behaviour).
ALTER TABLE `delivery_settings`
    ADD COLUMN `auto_assign_new` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `urgent_after_minutes` INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN `high_value_amount` DECIMAL(12, 2) NULL DEFAULT 15000;
