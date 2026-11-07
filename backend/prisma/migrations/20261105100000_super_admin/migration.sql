-- Super Admin Control Center. Hand-extracted from a prisma migrate diff (the auto-diff also proposed
-- dropping ~300 legitimate FK indexes — see docs/DATABASE.md; those were NOT included).


-- AlterTable
ALTER TABLE `businesses` ADD COLUMN `platform_status` VARCHAR(16) NOT NULL DEFAULT 'active',
    ADD COLUMN `platform_status_at` DATETIME(3) NULL,
    ADD COLUMN `platform_status_reason` TEXT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `platform_status` VARCHAR(16) NOT NULL DEFAULT 'active',
    ADD COLUMN `platform_status_at` DATETIME(3) NULL,
    ADD COLUMN `platform_status_reason` TEXT NULL;

-- CreateTable
CREATE TABLE `platform_admin_roles` (
    `key` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `permissions` JSON NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_admins` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role_key` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `totp_secret` TEXT NULL,
    `totp_enabled_at` DATETIME(3) NULL,
    `totp_last_step` INTEGER NULL,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_admins_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_admin_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `admin_id` VARCHAR(191) NOT NULL,
    `refresh_token_hash` VARCHAR(191) NOT NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_admin_sessions_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `admin_id` VARCHAR(191) NULL,
    `admin_email` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `action` VARCHAR(64) NOT NULL,
    `resource_type` VARCHAR(32) NOT NULL,
    `resource_id` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NOT NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` TEXT NULL,
    `request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_audit_logs_created_at_idx`(`created_at`),
    INDEX `platform_audit_logs_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `platform_audit_logs_admin_id_created_at_idx`(`admin_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `security_events` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(48) NOT NULL,
    `severity` VARCHAR(12) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `admin_id` VARCHAR(191) NULL,
    `identifier` VARCHAR(191) NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `security_events_created_at_idx`(`created_at`),
    INDEX `security_events_type_created_at_idx`(`type`, `created_at`),
    INDEX `security_events_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `security_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `security_events_ip_address_created_at_idx`(`ip_address`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entitlement_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `metric_code` VARCHAR(64) NOT NULL,
    `included_quantity` DECIMAL(14, 2) NOT NULL,
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `reason` TEXT NOT NULL,
    `created_by_admin_id` VARCHAR(191) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by_admin_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `entitlement_overrides_business_id_metric_code_idx`(`business_id`, `metric_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `module_access_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `module_key` VARCHAR(48) NOT NULL,
    `state` VARCHAR(16) NOT NULL,
    `reason` TEXT NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `created_by_admin_id` VARCHAR(191) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by_admin_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `module_access_overrides_business_id_module_key_idx`(`business_id`, `module_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_module_states` (
    `module_key` VARCHAR(48) NOT NULL,
    `globally_disabled` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NULL,
    `updated_by_admin_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`module_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internal_notes` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `admin_id` VARCHAR(191) NOT NULL,
    `admin_name` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internal_notes_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_admins` ADD CONSTRAINT `platform_admins_role_key_fkey` FOREIGN KEY (`role_key`) REFERENCES `platform_admin_roles`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_admin_sessions` ADD CONSTRAINT `platform_admin_sessions_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `platform_admins`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Append-only admin audit log (PRD §11.4): refuse UPDATE and DELETE at the database level.
CREATE TRIGGER `platform_audit_logs_no_update` BEFORE UPDATE ON `platform_audit_logs` FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'platform_audit_logs is append-only';
END;

CREATE TRIGGER `platform_audit_logs_no_delete` BEFORE DELETE ON `platform_audit_logs` FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'platform_audit_logs is append-only';
END;
