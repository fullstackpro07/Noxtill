-- Business Listings, depth (M17): Photos & Media cross-directory (UPD-BE-124) and Listings
-- Settings (UPD-BE-125). Additive only — no existing listings tables are touched.

-- CreateTable
CREATE TABLE `listing_photos` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `category` ENUM('exterior', 'interior', 'team', 'products', 'logo') NOT NULL,
    `pushed_providers` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `listing_photos_business_id_category_idx`(`business_id`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `listing_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `auto_sync_enabled` BOOLEAN NOT NULL DEFAULT false,
    `auto_sync_frequency_hours` INTEGER NOT NULL DEFAULT 24,
    `field_mapping` JSON NOT NULL DEFAULT (JSON_OBJECT()),
    `conflict_resolution` VARCHAR(191) NOT NULL DEFAULT 'master_wins',
    `last_auto_sync_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `listing_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `listing_photos` ADD CONSTRAINT `listing_photos_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `listing_settings` ADD CONSTRAINT `listing_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
