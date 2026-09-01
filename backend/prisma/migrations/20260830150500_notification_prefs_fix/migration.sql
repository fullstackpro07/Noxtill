-- Fixes a real design bug caught before this table had any data: a nullable `user_id` inside a
-- composite UNIQUE index doesn't actually enforce "one business-wide default row per event" —
-- MySQL never treats two NULLs as equal for uniqueness. Switches the "business default" sentinel
-- from NULL to '' (a value that can be genuinely unique) and drops the FK, since `''` never
-- matches a real `users.id` row and there's no other reason for a live relation here.
ALTER TABLE `notification_preferences` DROP FOREIGN KEY `notification_preferences_user_id_fkey`;

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `user_id` VARCHAR(191) NOT NULL DEFAULT '';
