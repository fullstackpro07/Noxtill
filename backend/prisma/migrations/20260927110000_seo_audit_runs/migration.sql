CREATE TABLE `seo_audit_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `site_url` VARCHAR(2048) NOT NULL,
    `final_url` VARCHAR(2048) NULL,
    `pages_discovered` INTEGER NOT NULL DEFAULT 0,
    `pages_crawled` INTEGER NOT NULL DEFAULT 0,
    `issues_found` INTEGER NOT NULL DEFAULT 0,
    `pages` JSON NULL,
    `issues` JSON NULL,
    `warnings` JSON NULL,
    `error` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`),
    INDEX `seo_audit_runs_business_id_status_started_at_idx`(`business_id`, `status`, `started_at`),
    CONSTRAINT `seo_audit_runs_business_id_fkey`
      FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
