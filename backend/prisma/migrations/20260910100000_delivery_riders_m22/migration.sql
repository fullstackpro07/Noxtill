-- Delivery & Riders depth (M22): real Rider vehicle/zone/commission fields, a real staff-recorded
-- delivery quality rating, and a real delivery failure-reason field — closing the gaps between the
-- plan doc's Riders-screen/All-Deliveries specs and what the original schema actually had.

-- AlterTable
ALTER TABLE `riders` ADD COLUMN `vehicle_type` ENUM('bike', 'motorcycle', 'car', 'van', 'on_foot') NULL;
ALTER TABLE `riders` ADD COLUMN `commission_rate` DECIMAL(5, 2) NULL;
ALTER TABLE `riders` ADD COLUMN `zone_ids` JSON NOT NULL DEFAULT (JSON_ARRAY());

-- AlterTable
ALTER TABLE `deliveries` ADD COLUMN `failure_reason` TEXT NULL;
ALTER TABLE `deliveries` ADD COLUMN `quality_rating` INTEGER NULL;
