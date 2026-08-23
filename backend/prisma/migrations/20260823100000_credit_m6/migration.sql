-- CreateTable
CREATE TABLE `credit_reminder_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `days_overdue_trigger` INTEGER NOT NULL,
    `tone` ENUM('gentle', 'firm', 'final') NOT NULL DEFAULT 'gentle',
    `channel` ENUM('whatsapp', 'sms', 'email') NULL,
    `custom_message` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `credit_reminder_rules_business_id_active_idx`(`business_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_reminder_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `rule_id` VARCHAR(191) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_reminder_logs_business_id_customer_id_rule_id_sent__idx`(`business_id`, `customer_id`, `rule_id`, `sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `credit_reminder_rules` ADD CONSTRAINT `credit_reminder_rules_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_reminder_logs` ADD CONSTRAINT `credit_reminder_logs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_reminder_logs` ADD CONSTRAINT `credit_reminder_logs_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_reminder_logs` ADD CONSTRAINT `credit_reminder_logs_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `credit_reminder_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
