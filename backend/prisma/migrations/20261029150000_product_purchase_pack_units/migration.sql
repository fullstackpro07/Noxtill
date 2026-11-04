ALTER TABLE `products`
  ADD COLUMN `stock_unit_label` VARCHAR(32) NULL,
  ADD COLUMN `purchase_unit_label` VARCHAR(32) NULL,
  ADD COLUMN `purchase_pack_size` INTEGER NULL;
