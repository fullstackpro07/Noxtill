CREATE TABLE `customer_portal_idempotency` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `principal_id` VARCHAR(191) NOT NULL,
    `key_hash` CHAR(64) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'processing',
    `response` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `cp_idempotency_business_principal_key` (`business_id`, `principal_id`, `key_hash`),
    INDEX `cp_idempotency_business_created_idx` (`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_portal_idempotency` ADD CONSTRAINT `customer_portal_idempotency_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
