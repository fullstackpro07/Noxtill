CREATE TABLE `customer_follow_up_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `priority` ENUM('urgent', 'normal', 'low') NOT NULL DEFAULT 'normal',
    `status` VARCHAR(24) NOT NULL DEFAULT 'open',
    `due_at` DATETIME(3) NULL,
    `assignee_staff_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(96) NOT NULL,
    `payload_hash` CHAR(64) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `completed_by_user_id` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_follow_up_tasks_business_idempotency_key` (`business_id`, `idempotency_key`),
    INDEX `customer_follow_up_tasks_business_status_due_idx` (`business_id`, `status`, `due_at`),
    INDEX `customer_follow_up_tasks_business_customer_created_idx` (`business_id`, `customer_id`, `created_at`),
    INDEX `customer_follow_up_tasks_business_assignee_status_idx` (`business_id`, `assignee_staff_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_follow_up_tasks`
    ADD CONSTRAINT `customer_follow_up_tasks_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `customer_follow_up_tasks`
    ADD CONSTRAINT `customer_follow_up_tasks_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `action_item_states`
    MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request', 'customer_segment', 'customer_follow_up') NOT NULL;
