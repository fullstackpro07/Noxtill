CREATE TABLE `website_sites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `draft_theme` JSON NOT NULL,
    `draft_navigation` JSON NOT NULL,
    `settings` JSON NOT NULL,
    `maintenance_mode` BOOLEAN NOT NULL DEFAULT false,
    `live_deployment_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `website_sites_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_pages` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('page', 'landing', 'post') NOT NULL DEFAULT 'page',
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `status` ENUM('draft', 'scheduled', 'published', 'unpublished') NOT NULL DEFAULT 'draft',
    `blocks` JSON NOT NULL,
    `meta_title` VARCHAR(200) NULL,
    `meta_description` VARCHAR(320) NULL,
    `excerpt` TEXT NULL,
    `hero_image_url` VARCHAR(1000) NULL,
    `category` VARCHAR(80) NULL,
    `tags` JSON NOT NULL,
    `show_in_header` BOOLEAN NOT NULL DEFAULT true,
    `campaign_id` VARCHAR(191) NULL,
    `goal` VARCHAR(20) NULL,
    `goal_target` VARCHAR(200) NULL,
    `utm_source` VARCHAR(80) NULL,
    `utm_medium` VARCHAR(80) NULL,
    `utm_campaign` VARCHAR(120) NULL,
    `author_user_id` VARCHAR(191) NULL,
    `ai_draft` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publish_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `published_version` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `website_pages_business_id_kind_status_idx`(`business_id`, `kind`, `status`),
    UNIQUE INDEX `website_pages_site_id_kind_slug_key`(`site_id`, `kind`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_page_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `page_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `blocks` JSON NOT NULL,
    `meta_title` VARCHAR(200) NULL,
    `meta_description` VARCHAR(320) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `note` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `website_page_versions_business_id_idx`(`business_id`),
    UNIQUE INDEX `website_page_versions_page_id_version_key`(`page_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_deployments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `kind` ENUM('publish', 'rollback') NOT NULL DEFAULT 'publish',
    `snapshot` JSON NOT NULL,
    `summary` VARCHAR(300) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `restored_from` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `website_deployments_business_id_created_at_idx`(`business_id`, `created_at`),
    UNIQUE INDEX `website_deployments_site_id_number_key`(`site_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_forms` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `fields` JSON NOT NULL,
    `destination` VARCHAR(40) NOT NULL DEFAULT 'crm_customer',
    `customer_tag` VARCHAR(60) NULL,
    `consent_text` TEXT NULL,
    `thank_you_message` TEXT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `public_token` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `website_forms_public_token_key`(`public_token`),
    INDEX `website_forms_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_form_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `form_id` VARCHAR(191) NOT NULL,
    `idempotency_key_hash` CHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `created_customer` BOOLEAN NOT NULL DEFAULT false,
    `marketing_consent` BOOLEAN NOT NULL DEFAULT false,
    `consent_text_shown` TEXT NULL,
    `is_test` BOOLEAN NOT NULL DEFAULT false,
    `page_id` VARCHAR(191) NULL,
    `utm` JSON NOT NULL,
    `error_reason` VARCHAR(300) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `website_form_submissions_business_id_created_at_idx`(`business_id`, `created_at`),
    UNIQUE INDEX `website_form_submissions_form_id_idempotency_key_hash_key`(`form_id`, `idempotency_key_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_domains` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `hostname` VARCHAR(253) NOT NULL,
    `verification_token` VARCHAR(64) NOT NULL,
    `status` ENUM('pending', 'verified', 'failed') NOT NULL DEFAULT 'pending',
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `last_checked_at` DATETIME(3) NULL,
    `last_error` VARCHAR(300) NULL,
    `ssl_valid_to` DATETIME(3) NULL,
    `ssl_error` VARCHAR(300) NULL,
    `ssl_checked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `website_domains_hostname_key`(`hostname`),
    INDEX `website_domains_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_redirects` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `from_path` VARCHAR(300) NOT NULL,
    `to_path` VARCHAR(1000) NOT NULL,
    `permanent` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `website_redirects_business_id_idx`(`business_id`),
    UNIQUE INDEX `website_redirects_site_id_from_path_key`(`site_id`, `from_path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_product_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `sort_priority` INTEGER NOT NULL DEFAULT 0,
    `badge` VARCHAR(40) NULL,
    `web_title` VARCHAR(200) NULL,
    `web_summary` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `website_product_settings_product_id_key`(`product_id`),
    INDEX `website_product_settings_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_collections` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `product_ids` JSON NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `website_collections_business_id_slug_key`(`business_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `website_sites` ADD CONSTRAINT `website_sites_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_pages` ADD CONSTRAINT `website_pages_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_pages` ADD CONSTRAINT `website_pages_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `website_sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_page_versions` ADD CONSTRAINT `website_page_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_page_versions` ADD CONSTRAINT `website_page_versions_page_id_fkey` FOREIGN KEY (`page_id`) REFERENCES `website_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `website_deployments` ADD CONSTRAINT `website_deployments_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_deployments` ADD CONSTRAINT `website_deployments_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `website_sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_forms` ADD CONSTRAINT `website_forms_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_forms` ADD CONSTRAINT `website_forms_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `website_sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_form_submissions` ADD CONSTRAINT `website_form_submissions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_form_submissions` ADD CONSTRAINT `website_form_submissions_form_id_fkey` FOREIGN KEY (`form_id`) REFERENCES `website_forms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_domains` ADD CONSTRAINT `website_domains_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_domains` ADD CONSTRAINT `website_domains_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `website_sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_redirects` ADD CONSTRAINT `website_redirects_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_redirects` ADD CONSTRAINT `website_redirects_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `website_sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_product_settings` ADD CONSTRAINT `website_product_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `website_product_settings` ADD CONSTRAINT `website_product_settings_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `website_collections` ADD CONSTRAINT `website_collections_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
