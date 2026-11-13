-- Auth & Social Login spec v1.0: provider identities (Google/Microsoft/Facebook), OAuth transactions
-- (state/nonce/PKCE + one-time handoff), WebAuthn passkeys and their challenges.
--
-- Rollback: DROP the four tables below. `users.google_id` is left untouched (no data lost) so the
-- previous Google sign-in code keeps working after a rollback.

CREATE TABLE `auth_identities` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(16) NOT NULL,
  `provider_subject` VARCHAR(191) NOT NULL,
  `provider_email` VARCHAR(191) NULL,
  `provider_email_verified` BOOLEAN NOT NULL DEFAULT false,
  `provider_display_name` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NULL,
  UNIQUE INDEX `auth_identities_provider_provider_subject_key`(`provider`, `provider_subject`),
  INDEX `auth_identities_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `auth_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Every existing Google link becomes an identity row. Google only ever linked verified emails.
INSERT INTO `auth_identities` (`id`, `user_id`, `provider`, `provider_subject`, `provider_email`, `provider_email_verified`, `created_at`)
SELECT UUID(), `id`, 'google', `google_id`, `email`, true, `updated_at`
FROM `users`
WHERE `google_id` IS NOT NULL;

CREATE TABLE `oauth_transactions` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(16) NOT NULL,
  `purpose` VARCHAR(8) NOT NULL,
  `state_hash` VARCHAR(64) NOT NULL,
  `nonce` VARCHAR(64) NOT NULL,
  `code_verifier` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `result` JSON NULL,
  `handoff_hash` VARCHAR(64) NULL,
  `handoff_expires_at` DATETIME(3) NULL,
  `handoff_used_at` DATETIME(3) NULL,
  `ticket_hash` VARCHAR(64) NULL,
  `ticket_expires_at` DATETIME(3) NULL,
  `ticket_used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `oauth_transactions_state_hash_key`(`state_hash`),
  UNIQUE INDEX `oauth_transactions_handoff_hash_key`(`handoff_hash`),
  UNIQUE INDEX `oauth_transactions_ticket_hash_key`(`ticket_hash`),
  INDEX `oauth_transactions_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `passkey_credentials` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `credential_id` VARCHAR(255) NOT NULL,
  `public_key` BLOB NOT NULL,
  `counter` INTEGER NOT NULL DEFAULT 0,
  `transports` JSON NOT NULL,
  `device_type` VARCHAR(16) NOT NULL,
  `backed_up` BOOLEAN NOT NULL DEFAULT false,
  `label` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NULL,
  UNIQUE INDEX `passkey_credentials_credential_id_key`(`credential_id`),
  INDEX `passkey_credentials_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `passkey_credentials_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webauthn_challenges` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `purpose` VARCHAR(8) NOT NULL,
  `challenge` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `webauthn_challenges_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
