-- CreateTable
CREATE TABLE `fin_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `config` JSON NOT NULL,
    `journal_seq` INTEGER NOT NULL DEFAULT 0,
    `bill_seq` INTEGER NOT NULL DEFAULT 0,
    `asset_seq` INTEGER NOT NULL DEFAULT 0,
    `tax_seq` INTEGER NOT NULL DEFAULT 0,
    `last_sweep_at` DATETIME(3) NULL,
    `backfilled_at` DATETIME(3) NULL,
    `sweep_error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` VARCHAR(12) NOT NULL,
    `subtype` VARCHAR(40) NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `currency` VARCHAR(3) NULL,
    `is_header` BOOLEAN NOT NULL DEFAULT false,
    `reconcilable` BOOLEAN NOT NULL DEFAULT false,
    `control` VARCHAR(12) NULL,
    `system_key` VARCHAR(40) NULL,
    `requires_department` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_accounts_business_id_code_key`(`business_id`, `code`),
    UNIQUE INDEX `fin_accounts_business_id_system_key_key`(`business_id`, `system_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_periods` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` VARCHAR(8) NOT NULL DEFAULT 'open',
    `locked_by_id` VARCHAR(191) NULL,
    `locked_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_periods_business_id_year_month_key`(`business_id`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_exchange_rates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `effective_on` DATE NOT NULL,
    `note` VARCHAR(200) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fin_exchange_rates_business_id_currency_effective_on_key`(`business_id`, `currency`, `effective_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_journals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(24) NOT NULL,
    `date` DATE NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `reference` VARCHAR(80) NULL,
    `memo` TEXT NULL,
    `status` VARCHAR(20) NOT NULL,
    `source_type` VARCHAR(24) NULL,
    `source_id` VARCHAR(64) NULL,
    `source_event` VARCHAR(24) NULL,
    `source_rev` INTEGER NOT NULL DEFAULT 0,
    `source_hash` VARCHAR(64) NULL,
    `source_label` VARCHAR(200) NULL,
    `superseded` BOOLEAN NOT NULL DEFAULT false,
    `branch_id` VARCHAR(191) NULL,
    `currency` VARCHAR(3) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `prepared_by_id` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `posted_by_id` VARCHAR(191) NULL,
    `posted_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `reversal_of_id` VARCHAR(191) NULL,
    `reversed_by_id` VARCHAR(191) NULL,
    `auto_reverse_on` DATE NULL,
    `failure_reason` VARCHAR(500) NULL,
    `batch_id` VARCHAR(40) NULL,
    `attachments` JSON NOT NULL,
    `department` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_journals_business_id_status_date_idx`(`business_id`, `status`, `date`),
    INDEX `fin_journals_business_id_date_idx`(`business_id`, `date`),
    UNIQUE INDEX `fin_journals_business_id_number_key`(`business_id`, `number`),
    UNIQUE INDEX `fin_journals_business_id_source_type_source_id_source_event__key`(`business_id`, `source_type`, `source_id`, `source_event`, `source_rev`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_journal_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `journal_id` VARCHAR(191) NOT NULL,
    `line_no` INTEGER NOT NULL,
    `account_id` VARCHAR(191) NULL,
    `description` VARCHAR(300) NULL,
    `debit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL,
    `fx_rate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `txn_debit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `txn_credit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `branch_id` VARCHAR(191) NULL,
    `department` VARCHAR(40) NULL,
    `customer_id` VARCHAR(191) NULL,
    `supplier_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `tax_code` VARCHAR(20) NULL,
    `date` DATE NOT NULL,
    `posted_at` DATETIME(3) NULL,

    INDEX `fin_journal_lines_business_id_account_id_date_idx`(`business_id`, `account_id`, `date`),
    INDEX `fin_journal_lines_business_id_date_idx`(`business_id`, `date`),
    INDEX `fin_journal_lines_journal_id_idx`(`journal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_tax_codes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `rate` DECIMAL(6, 3) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_tax_codes_business_id_code_key`(`business_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_tax_returns` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(24) NOT NULL,
    `jurisdiction` VARCHAR(80) NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `due_on` DATE NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `output_tax` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `input_tax` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `adjustments` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `snapshot` JSON NULL,
    `prepared_by_id` VARCHAR(191) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `filed_at` DATETIME(3) NULL,
    `filing_ref` VARCHAR(80) NULL,
    `attachments` JSON NOT NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_tax_returns_business_id_period_end_idx`(`business_id`, `period_end`),
    UNIQUE INDEX `fin_tax_returns_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `institution` VARCHAR(120) NULL,
    `mask` VARCHAR(8) NULL,
    `currency` VARCHAR(3) NOT NULL,
    `gl_account_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `payout_provider` VARCHAR(20) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_import_at` DATETIME(3) NULL,
    `statement_balance` DECIMAL(14, 2) NULL,
    `statement_date` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_bank_accounts_gl_account_id_key`(`gl_account_id`),
    INDEX `fin_bank_accounts_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bank_imports` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bank_account_id` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(200) NOT NULL,
    `format` VARCHAR(8) NOT NULL,
    `rows` INTEGER NOT NULL DEFAULT 0,
    `imported` INTEGER NOT NULL DEFAULT 0,
    `duplicates` INTEGER NOT NULL DEFAULT 0,
    `statement_start` DATE NULL,
    `statement_end` DATE NULL,
    `closing_balance` DECIMAL(14, 2) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_bank_imports_business_id_bank_account_id_idx`(`business_id`, `bank_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bank_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bank_account_id` VARCHAR(191) NOT NULL,
    `import_id` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `payee` VARCHAR(160) NULL,
    `reference` VARCHAR(120) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `dedupe_key` VARCHAR(64) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `external_payment_id` VARCHAR(191) NULL,
    `status` VARCHAR(16) NOT NULL,
    `suggestion` JSON NULL,
    `confidence` INTEGER NULL,
    `rule_id` VARCHAR(191) NULL,
    `matched_journal_id` VARCHAR(191) NULL,
    `matched_line_ids` JSON NULL,
    `created_journal_id` VARCHAR(191) NULL,
    `exclude_reason` VARCHAR(300) NULL,
    `reconciliation_id` VARCHAR(191) NULL,
    `matched_by_id` VARCHAR(191) NULL,
    `matched_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_bank_lines_business_id_status_idx`(`business_id`, `status`),
    INDEX `fin_bank_lines_bank_account_id_date_idx`(`bank_account_id`, `date`),
    UNIQUE INDEX `fin_bank_lines_business_id_bank_account_id_dedupe_key_key`(`business_id`, `bank_account_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bank_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `contains` VARCHAR(120) NOT NULL,
    `direction` VARCHAR(4) NOT NULL DEFAULT 'any',
    `account_id` VARCHAR(191) NOT NULL,
    `tax_code` VARCHAR(20) NULL,
    `mode` VARCHAR(8) NOT NULL DEFAULT 'suggest',
    `bank_account_id` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_bank_rules_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_reconciliations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bank_account_id` VARCHAR(191) NOT NULL,
    `period_end` DATE NOT NULL,
    `statement_balance` DECIMAL(14, 2) NOT NULL,
    `book_balance` DECIMAL(14, 2) NULL,
    `status` VARCHAR(16) NOT NULL,
    `items` JSON NOT NULL,
    `prepared_by_id` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `reopen_reason` VARCHAR(500) NULL,
    `attachments` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_reconciliations_business_id_bank_account_id_period_end_idx`(`business_id`, `bank_account_id`, `period_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bills` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(24) NOT NULL,
    `supplier_id` VARCHAR(191) NULL,
    `vendor_name` VARCHAR(160) NOT NULL,
    `vendor_invoice_no` VARCHAR(80) NULL,
    `bill_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `purchase_order_id` VARCHAR(191) NULL,
    `branch_id` VARCHAR(191) NULL,
    `currency` VARCHAR(3) NOT NULL,
    `fx_rate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL,
    `match_status` VARCHAR(12) NOT NULL DEFAULT 'No PO',
    `match_detail` JSON NULL,
    `intake` VARCHAR(20) NOT NULL DEFAULT 'Manual',
    `ocr` JSON NULL,
    `attachments` JSON NOT NULL,
    `hold_reason` VARCHAR(300) NULL,
    `reject_reason` VARCHAR(300) NULL,
    `notes` TEXT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `journal_id` VARCHAR(191) NULL,
    `posted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_bills_business_id_status_idx`(`business_id`, `status`),
    INDEX `fin_bills_business_id_vendor_invoice_no_idx`(`business_id`, `vendor_invoice_no`),
    UNIQUE INDEX `fin_bills_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bill_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bill_id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `unit_cost` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `amount` DECIMAL(14, 2) NOT NULL,
    `tax_code` VARCHAR(20) NULL,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `po_item_id` VARCHAR(191) NULL,
    `product_id` VARCHAR(191) NULL,
    `department` VARCHAR(40) NULL,

    INDEX `fin_bill_lines_bill_id_idx`(`bill_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_bill_payments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `bill_id` VARCHAR(191) NOT NULL,
    `bank_account_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `fx_rate` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `reference` VARCHAR(80) NULL,
    `journal_id` VARCHAR(191) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `voided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_bill_payments_business_id_bill_id_idx`(`business_id`, `bill_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_assets` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(24) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `acquired_on` DATE NOT NULL,
    `in_service_on` DATE NOT NULL,
    `cost` DECIMAL(14, 2) NOT NULL,
    `salvage` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `life_months` INTEGER NOT NULL,
    `method` VARCHAR(16) NOT NULL DEFAULT 'straight_line',
    `asset_account_id` VARCHAR(191) NOT NULL,
    `accum_account_id` VARCHAR(191) NOT NULL,
    `expense_account_id` VARCHAR(191) NOT NULL,
    `funding_account_id` VARCHAR(191) NULL,
    `bill_id` VARCHAR(191) NULL,
    `status` VARCHAR(24) NOT NULL,
    `capital_journal_id` VARCHAR(191) NULL,
    `disposed_on` DATE NULL,
    `disposal_proceeds` DECIMAL(14, 2) NULL,
    `disposal_journal_id` VARCHAR(191) NULL,
    `location` VARCHAR(120) NULL,
    `notes` TEXT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_assets_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `fin_assets_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_depreciation_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `assets` INTEGER NOT NULL,
    `journal_id` VARCHAR(191) NOT NULL,
    `run_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fin_depreciation_runs_business_id_year_month_key`(`business_id`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_budgets` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `fiscal_year` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(12) NOT NULL,
    `based_on_id` VARCHAR(191) NULL,
    `branch_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_budgets_business_id_fiscal_year_idx`(`business_id`, `fiscal_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_budget_lines` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `budget_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `department` VARCHAR(40) NULL,
    `explanation` VARCHAR(500) NULL,

    INDEX `fin_budget_lines_budget_id_idx`(`budget_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_close_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `started_by_id` VARCHAR(191) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `reopen_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_close_runs_business_id_year_month_key`(`business_id`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_close_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(24) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `area` VARCHAR(40) NOT NULL,
    `owner_user_id` VARCHAR(191) NULL,
    `due_on` DATE NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `attachments` JSON NOT NULL,
    `notes` TEXT NULL,
    `completed_by_id` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `fin_close_tasks_run_id_idx`(`run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `subject_type` VARCHAR(16) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(14, 2) NULL,
    `rule` VARCHAR(200) NOT NULL,
    `approver_role` VARCHAR(20) NOT NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `decided_by_id` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `comment` VARCHAR(500) NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_approvals_business_id_status_idx`(`business_id`, `status`),
    INDEX `fin_approvals_subject_type_subject_id_idx`(`subject_type`, `subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_access_grants` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `business_user_id` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `firm` VARCHAR(120) NULL,
    `permission` VARCHAR(12) NOT NULL,
    `branches` JSON NOT NULL,
    `expires_on` DATE NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `invited_by_id` VARCHAR(191) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fin_access_grants_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(120) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `subject_type` VARCHAR(20) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_audit_business_id_subject_type_subject_id_idx`(`business_id`, `subject_type`, `subject_id`),
    INDEX `fin_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_dismissals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `dismissed_by_id` VARCHAR(191) NULL,
    `until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fin_dismissals_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_health_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `results` JSON NOT NULL,
    `ok` INTEGER NOT NULL,
    `issues` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_health_runs_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_journal_lines` ADD CONSTRAINT `fin_journal_lines_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `fin_journals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_bill_lines` ADD CONSTRAINT `fin_bill_lines_bill_id_fkey` FOREIGN KEY (`bill_id`) REFERENCES `fin_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_bill_payments` ADD CONSTRAINT `fin_bill_payments_bill_id_fkey` FOREIGN KEY (`bill_id`) REFERENCES `fin_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_budget_lines` ADD CONSTRAINT `fin_budget_lines_budget_id_fkey` FOREIGN KEY (`budget_id`) REFERENCES `fin_budgets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_close_tasks` ADD CONSTRAINT `fin_close_tasks_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `fin_close_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
