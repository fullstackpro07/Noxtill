CREATE TABLE `seo_audit_issues` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `site_host` VARCHAR(255) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(32) NOT NULL,
  `page_url` VARCHAR(2048) NOT NULL,
  `evidence` TEXT NOT NULL,
  `recommendation` TEXT NOT NULL,
  `status` ENUM('open', 'resolved', 'ignored') NOT NULL DEFAULT 'open',
  `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_audit_run_id` VARCHAR(191) NULL,
  `resolved_at` DATETIME(3) NULL,
  `ignored_at` DATETIME(3) NULL,
  `ignore_reason` TEXT NULL,
  `decided_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `seo_audit_issues_business_fingerprint_key` (`business_id`, `fingerprint`),
  INDEX `seo_audit_issues_business_status_severity_seen_idx` (`business_id`, `status`, `severity`, `last_seen_at`),
  INDEX `seo_audit_issues_business_site_status_idx` (`business_id`, `site_host`, `status`),
  CONSTRAINT `seo_audit_issues_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `seo_audit_issues_last_seen_audit_run_id_fkey`
    FOREIGN KEY (`last_seen_audit_run_id`) REFERENCES `seo_audit_runs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `seo_audit_issue_audits` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `issue_id` VARCHAR(191) NOT NULL,
  `audit_run_id` VARCHAR(191) NULL,
  `action` VARCHAR(64) NOT NULL,
  `reason` TEXT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `seo_audit_issue_audits_business_issue_created_idx` (`business_id`, `issue_id`, `created_at`),
  INDEX `seo_audit_issue_audits_business_run_idx` (`business_id`, `audit_run_id`),
  CONSTRAINT `seo_audit_issue_audits_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `seo_audit_issue_audits_issue_id_fkey`
    FOREIGN KEY (`issue_id`) REFERENCES `seo_audit_issues` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `seo_audit_issue_audits_audit_run_id_fkey`
    FOREIGN KEY (`audit_run_id`) REFERENCES `seo_audit_runs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
