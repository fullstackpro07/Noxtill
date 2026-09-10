-- All Deliveries depth fix: a real on-time-rate needs a real promised-delivery-time concept, which
-- didn't exist. `promisedAt` is set at real assignment time from a real, business-configured SLA
-- (`DeliverySettings.defaultSlaMinutes`) — never fabricated after the fact for historical rows.

-- AlterTable
ALTER TABLE `deliveries` ADD COLUMN `promised_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `delivery_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `default_sla_minutes` INTEGER NOT NULL DEFAULT 45,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `delivery_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `delivery_settings` ADD CONSTRAINT `delivery_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
