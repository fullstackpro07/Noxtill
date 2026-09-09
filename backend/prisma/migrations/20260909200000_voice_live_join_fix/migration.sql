-- Live Calls listen/take-over depth fix: real staff-phone bridging into a live call via Twilio
-- conference redirect, replacing the earlier "polled status badge only" disclosed gap.

ALTER TABLE `phone_calls` ADD COLUMN `joined_at` DATETIME(3) NULL;
ALTER TABLE `phone_calls` ADD COLUMN `joined_by_user_id` VARCHAR(191) NULL;
