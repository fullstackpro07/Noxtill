ALTER TABLE `product_opportunities`
  ADD COLUMN `product_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `product_opportunities_product_id_key` (`product_id`),
  ADD CONSTRAINT `product_opportunities_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
