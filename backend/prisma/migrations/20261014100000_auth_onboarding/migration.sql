-- Auth & Onboarding: email verification, password reset/history, Google sign-in, AI onboarding state.

ALTER TABLE `users`
  ADD COLUMN `email_verified_at` DATETIME(3) NULL,
  ADD COLUMN `password_history` JSON NULL,
  ADD COLUMN `google_id` VARCHAR(191) NULL;
UPDATE `users` SET `password_history` = JSON_ARRAY() WHERE `password_history` IS NULL;
ALTER TABLE `users` MODIFY `password_history` JSON NOT NULL;
CREATE UNIQUE INDEX `users_google_id_key` ON `users`(`google_id`);
-- Every account that predates email verification is treated as verified.
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;

ALTER TABLE `businesses`
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `website` VARCHAR(191) NULL,
  ADD COLUMN `city` VARCHAR(191) NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `enabled_modules` JSON NULL,
  ADD COLUMN `onboarding_state` JSON NULL,
  ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL;
UPDATE `businesses` SET `enabled_modules` = JSON_ARRAY() WHERE `enabled_modules` IS NULL;
UPDATE `businesses` SET `onboarding_state` = JSON_OBJECT() WHERE `onboarding_state` IS NULL;
ALTER TABLE `businesses` MODIFY `enabled_modules` JSON NOT NULL, MODIFY `onboarding_state` JSON NOT NULL;
-- Every business that predates onboarding is treated as already set up (full sidebar kept).
UPDATE `businesses` SET `onboarding_completed_at` = `created_at` WHERE `onboarding_completed_at` IS NULL;

CREATE TABLE `auth_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(32) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `email` VARCHAR(191) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `auth_tokens_token_hash_key`(`token_hash`),
  INDEX `auth_tokens_user_id_purpose_idx`(`user_id`, `purpose`),
  PRIMARY KEY (`id`),
  CONSTRAINT `auth_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
