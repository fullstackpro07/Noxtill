CREATE TABLE `customer_portal_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `enabled_features` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `invite_expiry_hours` INTEGER NOT NULL DEFAULT 72,
    `terms_url` VARCHAR(191) NULL,
    `privacy_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_portal_settings_business_id_key` (`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_portal_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_signed_in_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `customer_portal_accounts_customer_id_key` (`customer_id`),
    INDEX `customer_portal_accounts_business_id_active_idx` (`business_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_portal_invites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `customer_portal_invites_token_hash_key` (`token_hash`),
    INDEX `customer_portal_invites_business_id_customer_id_expires_at_idx` (`business_id`, `customer_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_portal_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `customer_portal_sessions_token_hash_key` (`token_hash`),
    INDEX `customer_portal_sessions_business_id_account_id_expires_at_idx` (`business_id`, `account_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_portal_layout_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `layout` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `customer_portal_layout_versions_business_id_version_key` (`business_id`, `version`),
    INDEX `customer_portal_layout_versions_business_id_status_version_idx` (`business_id`, `status`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `customer_portal_activities` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NULL,
    `event` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NULL,
    `entity_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `customer_portal_activities_business_id_created_at_idx` (`business_id`, `created_at`),
    INDEX `cp_activities_business_customer_created_idx` (`business_id`, `customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_portal_settings` ADD CONSTRAINT `customer_portal_settings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_accounts` ADD CONSTRAINT `customer_portal_accounts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_accounts` ADD CONSTRAINT `customer_portal_accounts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_invites` ADD CONSTRAINT `customer_portal_invites_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_invites` ADD CONSTRAINT `customer_portal_invites_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_invites` ADD CONSTRAINT `customer_portal_invites_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_sessions` ADD CONSTRAINT `customer_portal_sessions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_sessions` ADD CONSTRAINT `customer_portal_sessions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `customer_portal_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `customer_portal_layout_versions` ADD CONSTRAINT `customer_portal_layout_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_layout_versions` ADD CONSTRAINT `customer_portal_layout_versions_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_activities` ADD CONSTRAINT `customer_portal_activities_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_activities` ADD CONSTRAINT `customer_portal_activities_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_portal_activities` ADD CONSTRAINT `customer_portal_activities_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `customer_portal_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
