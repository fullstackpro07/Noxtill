-- Staff module v2 — real one-off manual payroll adjustments (bonus/deduction) per staff per month.
-- CreateTable
CREATE TABLE `payroll_line_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `staff_user_id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `type` ENUM('add', 'deduct') NOT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payroll_line_items_business_id_staff_user_id_month_idx`(`business_id`, `staff_user_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payroll_line_items` ADD CONSTRAINT `payroll_line_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_line_items` ADD CONSTRAINT `payroll_line_items_staff_user_id_fkey` FOREIGN KEY (`staff_user_id`) REFERENCES `business_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
