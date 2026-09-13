-- Branches depth fix (UPD-INT-012): supports receiving less than the originally requested/shipped
-- quantity — `received_qty` records the real amount confirmed at the destination branch, so
-- destination stock is incremented by what actually arrived, not always the full requested qty.
ALTER TABLE `stock_transfer_items`
  ADD COLUMN `received_qty` INTEGER NULL;
