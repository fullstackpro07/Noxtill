-- AI Phone, full: per-call analysis fields, call notes, editable routing rules, knowledge entries,
-- receptionist data-sharing settings, provider cost, and human-readable booking numbers.

-- AlterTable
ALTER TABLE `phone_calls` ADD COLUMN `caller_email` VARCHAR(191) NULL,
    ADD COLUMN `caller_name` VARCHAR(191) NULL,
    ADD COLUMN `provider_cost` DECIMAL(10, 4) NULL,
    ADD COLUMN `provider_cost_checked_at` DATETIME(3) NULL,
    ADD COLUMN `provider_cost_unit` VARCHAR(191) NULL,
    ADD COLUMN `recording_deleted_at` DATETIME(3) NULL,
    ADD COLUMN `routed_rule_id` VARCHAR(191) NULL,
    ADD COLUMN `routed_rule_name` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `voice_settings` ADD COLUMN `share_catalog` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `share_credit_balance` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `share_order_status` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `transfer_number` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `appointments` ADD COLUMN `booking_no` INTEGER NULL;

-- Give every existing appointment a number, oldest first, per business.
UPDATE `appointments` a
JOIN (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY created_at, id) AS rn
    FROM `appointments`
) x ON x.id = a.id
SET a.booking_no = x.rn;

-- CreateIndex
CREATE UNIQUE INDEX `appointments_business_id_booking_no_key` ON `appointments`(`business_id`, `booking_no`);

-- CreateTable
CREATE TABLE `phone_call_notes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `call_id` VARCHAR(191) NOT NULL,
    `author_user_id` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `phone_call_notes_call_id_created_at_idx`(`call_id`, `created_at`),
    INDEX `phone_call_notes_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voice_routing_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `trigger_kind` ENUM('keyword', 'topic', 'sentiment', 'low_confidence', 'after_hours') NOT NULL,
    `match_value` VARCHAR(191) NULL,
    `action` ENUM('ai', 'take_message', 'transfer') NOT NULL,
    `transfer_number` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `voice_routing_rules_business_id_position_idx`(`business_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voice_knowledge_entries` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('faq', 'document') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `question` VARCHAR(191) NULL,
    `content` MEDIUMTEXT NOT NULL,
    `source_filename` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `voice_knowledge_entries_business_id_active_idx`(`business_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `phone_call_notes` ADD CONSTRAINT `phone_call_notes_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voice_routing_rules` ADD CONSTRAINT `voice_routing_rules_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voice_knowledge_entries` ADD CONSTRAINT `voice_knowledge_entries_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
