-- Delivery module redesign: a real 'delivery' activity type, so delivery lifecycle events feed
-- the same real, persisted activity log every other module already writes to.
ALTER TABLE `activity_events`
    MODIFY COLUMN `type` ENUM('sale','booking','review','payment','complaint','stock','low_stock','customer_lapsed','credit_overdue','birthday','delivery') NOT NULL;
