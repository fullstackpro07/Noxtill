-- Shift Closing depth fix: persist the real denomination breakdown entered while counting the
-- drawer, so a shift report can be printed/reprinted later against history.

-- AlterTable
ALTER TABLE `cash_shifts` ADD COLUMN `denomination_counts` JSON NULL;
