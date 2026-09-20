-- The day of the month the owner files their tax return by (a reminder date, not a statutory one).
-- AlterTable
ALTER TABLE `businesses` ADD COLUMN `tax_filing_day` INTEGER NOT NULL DEFAULT 15;
