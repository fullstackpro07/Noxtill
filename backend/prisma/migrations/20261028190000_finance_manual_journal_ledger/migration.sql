-- Finance manual journal ledger: tenant chart, balanced entries and explicit period locks.
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request', 'customer_segment', 'customer_follow_up', 'inventory_transfer_approval', 'finance_journal') NOT NULL;

CREATE TABLE `finance_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `finance_accounts_business_active_type_idx`(`business_id`, `active`, `type`),
    UNIQUE INDEX `finance_accounts_business_code_uq`(`business_id`, `code`),
    UNIQUE INDEX `finance_accounts_id_business_uq`(`id`, `business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `finance_accounting_periods` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `month_start` DATE NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'closed',
    `close_reason` TEXT NOT NULL,
    `closed_by_user_id` VARCHAR(191) NOT NULL,
    `closed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_periods_business_status_month_idx`(`business_id`, `status`, `month_start`),
    UNIQUE INDEX `finance_periods_business_month_uq`(`business_id`, `month_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `finance_journal_entries` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(80) NOT NULL,
    `entry_date` DATE NOT NULL,
    `currency_code` CHAR(3) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
    `total_debits` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `total_credits` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `review_reason` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `posted_by_user_id` VARCHAR(191) NULL,
    `posted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `finance_journals_business_status_date_idx`(`business_id`, `status`, `entry_date`),
    UNIQUE INDEX `finance_journals_business_reference_uq`(`business_id`, `reference`),
    UNIQUE INDEX `finance_journals_id_business_uq`(`id`, `business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `finance_journal_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `journal_entry_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `account_code` VARCHAR(64) NOT NULL,
    `account_name` VARCHAR(191) NOT NULL,
    `memo` TEXT NULL,
    `debit` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_journal_lines_business_entry_idx`(`business_id`, `journal_entry_id`),
    INDEX `finance_journal_lines_business_account_idx`(`business_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `finance_accounting_periods` ADD CONSTRAINT `finance_periods_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `finance_journal_entries` ADD CONSTRAINT `finance_journals_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `finance_journal_lines` ADD CONSTRAINT `finance_journal_lines_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `finance_journal_lines` ADD CONSTRAINT `finance_journal_lines_entry_fk` FOREIGN KEY (`journal_entry_id`, `business_id`) REFERENCES `finance_journal_entries`(`id`, `business_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `finance_journal_lines` ADD CONSTRAINT `finance_journal_lines_account_fk` FOREIGN KEY (`account_id`, `business_id`) REFERENCES `finance_accounts`(`id`, `business_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
