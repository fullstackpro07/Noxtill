CREATE TABLE `customer_channel_consents` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `channel` ENUM('whatsapp', 'sms', 'email') NOT NULL,
    `state` ENUM('granted', 'revoked') NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `evidence_reference` VARCHAR(100) NOT NULL,
    `revision` INTEGER NOT NULL,
    `recorded_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customer_channel_consent_revision_key`(`business_id`, `customer_id`, `channel`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_channel_consents` ADD CONSTRAINT `customer_channel_consents_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `customer_channel_consents` ADD CONSTRAINT `customer_channel_consents_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
