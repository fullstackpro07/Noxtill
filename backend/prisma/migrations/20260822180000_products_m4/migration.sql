-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_business_id_name_key`(`business_id`, `name`),
    INDEX `categories_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Services formal fields (UPD-BE-087) + Category relation (UPD-BE-088)
ALTER TABLE `products`
    ADD COLUMN `category_id` VARCHAR(191) NULL,
    ADD COLUMN `eligible_staff_ids` JSON NOT NULL DEFAULT ('[]'),
    ADD COLUMN `buffer_before_min` INTEGER NULL,
    ADD COLUMN `buffer_after_min` INTEGER NULL,
    ADD COLUMN `deposit_required` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `deposit_amount` DECIMAL(12, 2) NULL;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: backfill a real Category row for every distinct existing free-text
-- Product.category value per business, then point each product's new category_id at it. The old
-- free-text `category` column is left untouched for backward compatibility with existing readers.
INSERT INTO `categories` (`id`, `business_id`, `name`, `sort_order`, `created_at`, `updated_at`)
SELECT UUID(), d.business_id, d.category, 0, NOW(3), NOW(3)
FROM (
    SELECT DISTINCT `business_id`, `category`
    FROM `products`
    WHERE `category` IS NOT NULL AND `category` <> ''
) AS d;

UPDATE `products` p
JOIN `categories` c ON c.`business_id` = p.`business_id` AND c.`name` = p.`category`
SET p.`category_id` = c.`id`
WHERE p.`category` IS NOT NULL AND p.`category` <> '';
