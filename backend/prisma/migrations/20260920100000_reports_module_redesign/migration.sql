-- Reports module redesign: persisted report runs (versions, validation, deliveries), favourites,
-- tax filings + reminders, data export jobs, and schedule day/last-result tracking.

-- AlterTable
ALTER TABLE `scheduled_exports`
  ADD COLUMN `day_of_week` INTEGER NULL,
  ADD COLUMN `day_of_month` INTEGER NULL,
  ADD COLUMN `last_result` VARCHAR(191) NULL,
  ADD COLUMN `last_error` TEXT NULL,
  ADD COLUMN `last_report_run_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `report_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('ready', 'failed') NOT NULL,
    `trigger` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `generated_by_user_id` VARCHAR(191) NULL,
    `schedule_id` VARCHAR(191) NULL,
    `file_key` VARCHAR(191) NULL,
    `records_count` INTEGER NOT NULL DEFAULT 0,
    `snapshot` JSON NULL,
    `error_message` TEXT NULL,
    `deliveries` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `report_runs_business_id_kind_period_idx`(`business_id`, `kind`, `period`),
    INDEX `report_runs_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_favorites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `report_favorites_business_id_user_id_kind_key`(`business_id`, `user_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_filings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `filed_on` DATETIME(3) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `net_tax_at_filing` DECIMAL(14, 2) NOT NULL,
    `filed_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tax_filings_business_id_period_key`(`business_id`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `remind_on` DATE NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tax_reminders_sent_at_remind_on_idx`(`sent_at`, `remind_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_export_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `requested_by_user_id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `modules` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `format` VARCHAR(191) NOT NULL,
    `status` ENUM('queued', 'preparing', 'ready', 'failed') NOT NULL DEFAULT 'queued',
    `records_count` INTEGER NOT NULL DEFAULT 0,
    `size_bytes` INTEGER NOT NULL DEFAULT 0,
    `file_key` VARCHAR(191) NULL,
    `ready_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `sensitive` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `data_export_jobs_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
