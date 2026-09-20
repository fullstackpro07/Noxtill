-- Settings hub: per-user pinned settings and open counts (drives "Pinned and frequent").

-- CreateTable
CREATE TABLE `setting_pins` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `row_key` VARCHAR(191) NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `opens` INTEGER NOT NULL DEFAULT 0,
    `last_opened_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `setting_pins_business_id_user_id_category_row_key_key`(`business_id`, `user_id`, `category`, `row_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
