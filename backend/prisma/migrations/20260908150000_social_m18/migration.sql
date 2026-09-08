-- Social Media Management, depth (M18): Published Posts per-post analytics (UPD-BE-127).
-- UPD-BE-126 (Scheduled Posts retry/backoff/queue) needed no schema change — real service-level
-- logic on top of the existing `social_posts`/`social_post_targets` tables only.

-- CreateTable
CREATE TABLE `social_post_analytics` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `social_post_target_id` VARCHAR(191) NOT NULL,
    `reach` INTEGER NOT NULL DEFAULT 0,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `comments` INTEGER NOT NULL DEFAULT 0,
    `shares` INTEGER NOT NULL DEFAULT 0,
    `saves` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `pulled_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `social_post_analytics_social_post_target_id_key`(`social_post_target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_post_analytics` ADD CONSTRAINT `social_post_analytics_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_post_analytics` ADD CONSTRAINT `social_post_analytics_social_post_target_id_fkey` FOREIGN KEY (`social_post_target_id`) REFERENCES `social_post_targets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
