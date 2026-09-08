-- Social Media Management, M18 disclosed-gap fixes: real AI caption generation history.
-- (Draft editing and hashtag suggestions needed no schema change — service-level logic on top of
-- existing tables only.)

-- CreateTable
CREATE TABLE `social_caption_generations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `tone` VARCHAR(191) NULL,
    `caption` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `social_caption_generations_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_caption_generations` ADD CONSTRAINT `social_caption_generations_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
