-- AlterTable
ALTER TABLE `appointments` MODIFY `source` ENUM('link', 'qr', 'walk_in', 'waitlist', 'phone') NOT NULL DEFAULT 'link';

-- CreateTable
CREATE TABLE `phone_numbers` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `twilio_sid` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(191) NOT NULL,
    `provisioned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `phone_numbers_business_id_key`(`business_id`),
    UNIQUE INDEX `phone_numbers_phone_number_key`(`phone_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `phone_calls` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `call_sid` VARCHAR(191) NOT NULL,
    `from_number` VARCHAR(191) NOT NULL,
    `status` ENUM('in_progress', 'completed', 'missed', 'transferred') NOT NULL DEFAULT 'in_progress',
    `outcome` ENUM('none', 'booking', 'message', 'transfer') NOT NULL DEFAULT 'none',
    `transcript` JSON NOT NULL,
    `recording_key` VARCHAR(191) NULL,
    `appointment_id` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `phone_calls_call_sid_key`(`call_sid`),
    INDEX `phone_calls_business_id_status_started_at_idx`(`business_id`, `status`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `phone_numbers` ADD CONSTRAINT `phone_numbers_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phone_calls` ADD CONSTRAINT `phone_calls_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phone_calls` ADD CONSTRAINT `phone_calls_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
