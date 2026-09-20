-- Marketing module v2 — Content Planner: a real, minimal content calendar.
-- CreateTable
CREATE TABLE `content_items` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('social_post','story','reel','email','sms','whatsapp','article') NOT NULL,
    `channel` ENUM('instagram','facebook','email','whatsapp','sms') NOT NULL,
    `body` TEXT NOT NULL,
    `scheduled_for` DATETIME(3) NULL,
    `status` ENUM('draft','needs_approval','scheduled','published','failed') NOT NULL DEFAULT 'draft',
    `owner_user_id` VARCHAR(191) NULL,
    `ai_generated` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `content_items_business_id_scheduled_for_idx`(`business_id`, `scheduled_for`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `business_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
