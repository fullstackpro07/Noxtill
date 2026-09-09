-- AI Phone Receptionist depth (M20): Call Queue (UPD-BE-129) + real Receptionist Settings
-- (UPD-FE-051e) wired into actual call behavior — voice, response timeout, queue-hold message,
-- custom intents. No route-path fix migration needed (missed-calls route rename is code-only).

-- AlterTable: widen the outcome enum with `custom` (configured custom-intent match)
ALTER TABLE `phone_calls` MODIFY `outcome` ENUM('none', 'booking', 'message', 'transfer', 'custom') NOT NULL DEFAULT 'none';

-- AlterTable: real operational-queue tracking fields
ALTER TABLE `phone_calls` ADD COLUMN `custom_intent_name` VARCHAR(191) NULL;
ALTER TABLE `phone_calls` ADD COLUMN `resolved_at` DATETIME(3) NULL;
ALTER TABLE `phone_calls` ADD COLUMN `callback_requested_at` DATETIME(3) NULL;

CREATE INDEX `phone_calls_business_id_resolved_at_idx` ON `phone_calls`(`business_id`, `resolved_at`);

-- CreateTable
CREATE TABLE `voice_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `voice_id` VARCHAR(191) NULL,
    `response_timeout_seconds` INTEGER NOT NULL DEFAULT 5,
    `queue_hold_message` TEXT NULL,
    `custom_intents` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `voice_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `voice_settings` ADD CONSTRAINT `voice_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
