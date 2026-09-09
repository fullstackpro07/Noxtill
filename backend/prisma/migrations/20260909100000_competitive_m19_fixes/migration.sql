-- Competitive Insights depth (M19): real Google-place-search competitor add-flow needs a
-- human-readable name field separate from platformRef (which becomes an opaque Place ID); backfill
-- existing rows from their current platformRef (which WAS the free-text label) before enforcing
-- NOT NULL. Also adds the weekly-report-recipient field for Competitive Settings full spec parity.

-- AddColumn (nullable first, so the backfill has somewhere to write)
ALTER TABLE `competitors` ADD COLUMN `name` VARCHAR(191) NULL;

-- Backfill: every pre-existing competitor's platformRef WAS its free-text display name.
UPDATE `competitors` SET `name` = `platform_ref` WHERE `name` IS NULL;

-- Now safe to enforce NOT NULL.
ALTER TABLE `competitors` MODIFY COLUMN `name` VARCHAR(191) NOT NULL;

-- AddColumn
ALTER TABLE `competitive_settings` ADD COLUMN `weekly_report_recipient` VARCHAR(191) NULL;
