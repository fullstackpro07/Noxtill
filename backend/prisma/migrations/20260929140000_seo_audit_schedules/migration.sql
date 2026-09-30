ALTER TABLE `seo_audit_runs`
  ADD COLUMN `triggered_by` VARCHAR(24) NOT NULL DEFAULT 'manual';

CREATE TABLE `seo_audit_schedules` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `interval_hours` INTEGER NOT NULL DEFAULT 168,
  `next_run_at` DATETIME(3) NULL,
  `processing_at` DATETIME(3) NULL,
  `last_run_at` DATETIME(3) NULL,
  `last_run_id` VARCHAR(191) NULL,
  `last_status` VARCHAR(32) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `seo_audit_schedules_business_id_key` (`business_id`),
  INDEX `seo_audit_schedules_enabled_next_idx` (`enabled`, `next_run_at`),
  CONSTRAINT `seo_audit_schedules_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
