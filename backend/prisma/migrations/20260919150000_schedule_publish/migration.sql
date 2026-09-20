-- Staff module v2 — real, shared "week published" state for the Schedule screen (was localStorage-only).
-- CreateTable
CREATE TABLE `schedule_publishes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `week_start` DATETIME(3) NOT NULL,
    `published_by_user_id` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `schedule_publishes_business_id_week_start_key`(`business_id`, `week_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schedule_publishes` ADD CONSTRAINT `schedule_publishes_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
