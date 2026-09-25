-- Delivery module redesign: real "on break" signal for riders (no other real field distinguishes
-- a mid-shift pause from simply being active).
ALTER TABLE `riders`
    ADD COLUMN `on_break_since` DATETIME(3) NULL;
