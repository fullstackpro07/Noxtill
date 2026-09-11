-- Estimated-impact depth fix: a real dollar figure already present in the underlying fact
-- (revenue delta / overdue balance), never a fabricated estimate. Null where no such figure
-- naturally exists (stock/customers/marketing facts).

-- AlterTable
ALTER TABLE `ai_insights` ADD COLUMN `estimated_impact` DECIMAL(12, 2) NULL;
