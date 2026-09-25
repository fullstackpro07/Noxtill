-- Delivery module redesign: two more real, owner-configured thresholds used to flag an overloaded
-- rider or a stale GPS fix — both have safe, behavior-preserving defaults.
ALTER TABLE `delivery_settings`
    ADD COLUMN `warn_at_stop_count` INTEGER NOT NULL DEFAULT 8,
    ADD COLUMN `stale_location_minutes` INTEGER NOT NULL DEFAULT 10;
