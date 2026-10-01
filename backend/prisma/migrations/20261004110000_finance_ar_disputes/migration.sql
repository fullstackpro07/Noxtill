-- CreateTable
CREATE TABLE `fin_ar_disputes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `raised_by_id` VARCHAR(191) NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolution` VARCHAR(300) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_ar_disputes_business_id_order_id_idx`(`business_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

