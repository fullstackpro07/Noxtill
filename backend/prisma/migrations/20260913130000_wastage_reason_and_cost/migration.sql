-- Inventory depth fix (UPD-INT-013): a structured category for a wastage/theft movement,
-- separate from the free-text `reason` (which stays human-readable, note included) so wastage can
-- be grouped by real reason regardless of what note each entry carries.
ALTER TABLE `stock_movements`
  ADD COLUMN `wastage_reason` ENUM('Expired', 'Damaged', 'Theft', 'Other') NULL;
