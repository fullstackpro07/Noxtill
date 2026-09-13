-- Reports depth fix (UPD-INT-015): persists the real per-line tax rate a sale was actually taxed
-- at (already computed at sale time via `resolveTaxRatePercent`, just never saved), so a tax
-- report can show a real per-rate breakdown instead of only ever one blended business-level rate.
ALTER TABLE `order_items`
  ADD COLUMN `tax_rate_percent` DECIMAL(5, 2) NULL;
