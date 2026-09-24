-- AlterTable
ALTER TABLE `competitors` ADD COLUMN `priority` VARCHAR(191) NOT NULL DEFAULT 'keep_an_eye';

-- CreateTable
CREATE TABLE `competitor_observations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `competitor_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NULL,
    `ends_at` DATETIME(3) NULL,
    `source` VARCHAR(191) NULL,
    `observed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `competitor_observations_business_id_observed_at_idx`(`business_id`, `observed_at`),
    INDEX `competitor_observations_competitor_id_kind_label_idx`(`competitor_id`, `kind`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `competitor_observations` ADD CONSTRAINT `competitor_observations_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competitor_observations` ADD CONSTRAINT `competitor_observations_competitor_id_fkey` FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
