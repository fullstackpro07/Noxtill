-- CreateTable
CREATE TABLE `finance_bank_statement_imports` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `finance_account_id` VARCHAR(191) NOT NULL,
    `currency_code` CHAR(3) NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `row_count` INTEGER NOT NULL,
    `source_hash` CHAR(64) NOT NULL,
    `imported_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_bank_statement_imports_business_period_idx`(`business_id`, `period_end`, `created_at`),
    UNIQUE INDEX `finance_bank_statement_imports_id_business_uq`(`id`, `business_id`),
    UNIQUE INDEX `finance_bank_statement_imports_source_uq`(`business_id`, `finance_account_id`, `source_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_bank_statement_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `import_id` VARCHAR(191) NOT NULL,
    `line_number` INTEGER NOT NULL,
    `statement_date` DATE NOT NULL,
    `amount` DECIMAL(16, 2) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'unmatched',
    `matched_journal_line_id` VARCHAR(191) NULL,
    `decision_by_user_id` VARCHAR(191) NULL,
    `decision_at` DATETIME(3) NULL,
    `decision_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_bank_statement_lines_business_status_date_idx`(`business_id`, `status`, `statement_date`),
    INDEX `finance_bank_statement_lines_business_import_status_idx`(`business_id`, `import_id`, `status`),
    UNIQUE INDEX `finance_bank_statement_lines_import_line_uq`(`business_id`, `import_id`, `line_number`),
    UNIQUE INDEX `finance_bank_statement_lines_match_uq`(`business_id`, `matched_journal_line_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `finance_journal_lines_id_business_uq` ON `finance_journal_lines`(`id`, `business_id`);

-- AddForeignKey
ALTER TABLE `finance_bank_statement_imports` ADD CONSTRAINT `finance_bank_statement_imports_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_bank_statement_imports` ADD CONSTRAINT `finance_bank_statement_imports_account_fk` FOREIGN KEY (`finance_account_id`, `business_id`) REFERENCES `finance_accounts`(`id`, `business_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_bank_statement_lines` ADD CONSTRAINT `finance_bank_statement_lines_business_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_bank_statement_lines` ADD CONSTRAINT `finance_bank_statement_lines_import_fk` FOREIGN KEY (`import_id`, `business_id`) REFERENCES `finance_bank_statement_imports`(`id`, `business_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_bank_statement_lines` ADD CONSTRAINT `finance_bank_statement_lines_match_fk` FOREIGN KEY (`matched_journal_line_id`, `business_id`) REFERENCES `finance_journal_lines`(`id`, `business_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
