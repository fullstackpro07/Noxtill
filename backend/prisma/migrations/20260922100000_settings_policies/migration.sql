-- Settings policies: owner-tunable business rules, per-user UI preferences, notification priority,
-- tax-inclusive orders, per-customer credit limits and backup-triggered data exports.

ALTER TABLE `businesses` ADD COLUMN `policies` JSON NOT NULL DEFAULT (JSON_OBJECT());
ALTER TABLE `users` ADD COLUMN `ui_preferences` JSON NOT NULL DEFAULT (JSON_OBJECT());
ALTER TABLE `notifications` ADD COLUMN `priority` VARCHAR(191) NOT NULL DEFAULT 'normal';
ALTER TABLE `orders` ADD COLUMN `tax_inclusive` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `customers` ADD COLUMN `credit_limit` DECIMAL(12, 2) NULL;
ALTER TABLE `data_export_jobs` ADD COLUMN `trigger` VARCHAR(191) NOT NULL DEFAULT 'manual';
