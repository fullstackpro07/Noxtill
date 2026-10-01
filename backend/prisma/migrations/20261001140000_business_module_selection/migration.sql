-- Module selection per business: top-level modules a business has turned off (shared by branches via the root business).
ALTER TABLE `businesses` ADD COLUMN `disabled_modules` JSON NOT NULL DEFAULT (JSON_ARRAY());
