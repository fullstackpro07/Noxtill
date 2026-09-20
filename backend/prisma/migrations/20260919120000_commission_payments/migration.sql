-- Staff module v2 — real "Mark Paid" tracking for commission, one row per staff member per month.
-- CreateTable
CREATE TABLE `commission_payments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `staff_user_id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `paid_by_user_id` VARCHAR(191) NULL,
    `paid_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commission_payments_business_id_staff_user_id_month_key`(`business_id`, `staff_user_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commission_payments` ADD CONSTRAINT `commission_payments_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_payments` ADD CONSTRAINT `commission_payments_staff_user_id_fkey` FOREIGN KEY (`staff_user_id`) REFERENCES `business_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
