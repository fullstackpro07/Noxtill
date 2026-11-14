-- Authentication Security Specification v1.0 (2026-11-14): opaque cookie sessions with rotating
-- refresh tokens, TOTP/passkey MFA (WhatsApp 2FA retired), Argon2id passwords, device recognition,
-- rate-limit buckets, Facebook deletion callbacks.
--
-- Rollback: DROP the five new tables and the added columns. Existing sessions are not usable by the
-- previous JWT build after a rollback (users sign in again); no user data is lost.

ALTER TABLE `users`
  ADD COLUMN `mfa_required` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `totp_secret_enc` TEXT NULL,
  ADD COLUMN `totp_enabled_at` DATETIME(3) NULL,
  ADD COLUMN `totp_last_step` INTEGER NULL,
  ADD COLUMN `recovery_codes` JSON NULL,
  ADD COLUMN `has_password` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `must_reset` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `webauthn_user_id` VARCHAR(96) NULL,
  ADD COLUMN `otp_locked_until` DATETIME(3) NULL;
UPDATE `users` SET `recovery_codes` = JSON_ARRAY() WHERE `recovery_codes` IS NULL;
ALTER TABLE `users` MODIFY `recovery_codes` JSON NOT NULL;
CREATE UNIQUE INDEX `users_webauthn_user_id_key` ON `users`(`webauthn_user_id`);

-- WhatsApp-code 2FA is retired (spec §6.2). Anyone who had it, and every owner, must enrol an
-- authenticator app or a passkey on their next sign-in.
UPDATE `users` SET `mfa_required` = true WHERE `two_factor_enabled` = true;
UPDATE `users` u JOIN `business_users` bu ON bu.`user_id` = u.`id` AND bu.`role` = 'owner' SET u.`mfa_required` = true;
UPDATE `users` SET `two_factor_enabled` = false;

ALTER TABLE `auth_identities`
  ADD COLUMN `tenant_id` VARCHAR(64) NULL,
  ADD COLUMN `disabled_at` DATETIME(3) NULL;

ALTER TABLE `passkey_credentials`
  ADD COLUMN `aaguid` VARCHAR(36) NULL,
  ADD COLUMN `disabled_at` DATETIME(3) NULL;

ALTER TABLE `sessions`
  ADD COLUMN `access_token_hash` VARCHAR(64) NULL,
  ADD COLUMN `access_expires_at` DATETIME(3) NULL,
  ADD COLUMN `claims` JSON NULL,
  ADD COLUMN `shared_device` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `absolute_expires_at` DATETIME(3) NULL,
  ADD COLUMN `step_up_at` DATETIME(3) NULL,
  ADD COLUMN `mfa_setup_required` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `method` VARCHAR(16) NULL,
  ADD COLUMN `country` VARCHAR(8) NULL;
CREATE UNIQUE INDEX `sessions_access_token_hash_key` ON `sessions`(`access_token_hash`);
-- JWT-era sessions cannot be used by the opaque-token build; end them cleanly.
UPDATE `sessions` SET `revoked_at` = CURRENT_TIMESTAMP(3) WHERE `revoked_at` IS NULL;

CREATE TABLE `refresh_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `session_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
  INDEX `refresh_tokens_session_id_idx`(`session_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `refresh_tokens_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `known_devices` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `device_hash` VARCHAR(64) NOT NULL,
  `user_agent` TEXT NULL,
  `first_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `known_devices_user_id_device_hash_key`(`user_id`, `device_hash`),
  PRIMARY KEY (`id`),
  CONSTRAINT `known_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_rate_buckets` (
  `key` VARCHAR(191) NOT NULL,
  `window_start` DATETIME(3) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `facebook_deletion_requests` (
  `id` VARCHAR(191) NOT NULL,
  `confirmation_code` VARCHAR(32) NOT NULL,
  `facebook_user_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  UNIQUE INDEX `facebook_deletion_requests_confirmation_code_key`(`confirmation_code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
