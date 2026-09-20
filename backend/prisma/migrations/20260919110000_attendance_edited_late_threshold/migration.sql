-- Staff module v2 — real manual attendance entry / correction, and a real "Late" threshold
-- setting to derive attendance status against scheduled shift start times.
ALTER TABLE `attendance` ADD COLUMN `edited` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `businesses` ADD COLUMN `late_threshold_minutes` INTEGER NOT NULL DEFAULT 10;
