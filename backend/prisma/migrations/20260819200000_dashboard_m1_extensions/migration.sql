-- CreateTable
CREATE TABLE `nightly_close_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `close_date` DATE NOT NULL,
    `channel` ENUM('whatsapp', 'sms', 'email') NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `nightly_close_logs_business_id_close_date_key`(`business_id`, `close_date`),
    INDEX `nightly_close_logs_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `health_score_weight_changes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `old_weights` JSON NOT NULL,
    `new_weights` JSON NOT NULL,
    `old_score` DECIMAL(5, 2) NOT NULL,
    `new_score` DECIMAL(5, 2) NOT NULL,
    `changed_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `health_score_weight_changes_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `nightly_close_logs` ADD CONSTRAINT `nightly_close_logs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `health_score_weight_changes` ADD CONSTRAINT `health_score_weight_changes_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
