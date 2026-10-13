CREATE TABLE `voice_call_transfers` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `call_id` VARCHAR(191) NOT NULL,
    `attempt_number` INTEGER NOT NULL DEFAULT 1,
    `mode` VARCHAR(10) NOT NULL DEFAULT 'cold',
    `destination` VARCHAR(32) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `provider_status` VARCHAR(40) NULL,
    `provider_call_sid` VARCHAR(34) NULL,
    `requested_by_user_id` VARCHAR(191) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `voice_call_transfer_call_status_idx`(`business_id`, `call_id`, `status`),
    UNIQUE INDEX `voice_call_transfer_attempt_key`(`business_id`, `call_id`, `attempt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_call_transfers` ADD CONSTRAINT `voice_call_transfers_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_call_transfers` ADD CONSTRAINT `voice_call_transfers_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
