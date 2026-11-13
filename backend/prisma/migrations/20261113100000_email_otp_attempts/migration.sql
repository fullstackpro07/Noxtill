-- Email verification switched from emailed links to 6-digit codes: track wrong-code attempts per code.
ALTER TABLE `auth_tokens` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;
