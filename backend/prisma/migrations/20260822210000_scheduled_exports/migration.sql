-- CreateTable
CREATE TABLE `scheduled_exports` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `frequency` ENUM('weekly', 'monthly') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_user_id` VARCHAR(191) NULL,
    `last_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `scheduled_exports_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `scheduled_exports` ADD CONSTRAINT `scheduled_exports_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
