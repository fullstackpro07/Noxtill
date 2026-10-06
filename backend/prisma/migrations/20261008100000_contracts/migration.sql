-- AlterTable
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'finance_approval', 'payment_approval', 'payment_dispute_due', 'payment_failed', 'asset_pm_overdue', 'asset_down_critical', 'asset_wo_approval', 'field_approval', 'field_sla_breach', 'field_unassigned_urgent', 'contract_approval', 'contract_expiring', 'contract_obligation_overdue', 'contract_signature_issue') NOT NULL;

-- CreateTable
CREATE TABLE `ct_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `next_doc` INTEGER NOT NULL DEFAULT 1,
    `next_ctr` INTEGER NOT NULL DEFAULT 1,
    `ctr_year` INTEGER NOT NULL DEFAULT 0,
    `next_tpl` INTEGER NOT NULL DEFAULT 1,
    `next_sig` INTEGER NOT NULL DEFAULT 1,
    `next_apr` INTEGER NOT NULL DEFAULT 1,
    `next_cmp` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ct_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_settings_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `changed` JSON NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ct_settings_versions_business_id_version_key`(`business_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_documents` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `folder` VARCHAR(60) NOT NULL,
    `description` TEXT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `link_module` VARCHAR(40) NULL,
    `link_id` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL,
    `sensitivity` VARCHAR(14) NOT NULL,
    `expires_on` DATE NULL,
    `retention` VARCHAR(40) NOT NULL,
    `tags` JSON NOT NULL,
    `shares` JSON NOT NULL,
    `legal_hold` VARCHAR(255) NULL,
    `processing` VARCHAR(255) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ct_documents_business_id_folder_idx`(`business_id`, `folder`),
    UNIQUE INDEX `ct_documents_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_doc_versions` (
    `id` VARCHAR(191) NOT NULL,
    `doc_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `storage_key` VARCHAR(400) NULL,
    `file_name` VARCHAR(255) NULL,
    `mime` VARCHAR(120) NULL,
    `size` INTEGER NOT NULL DEFAULT 0,
    `sha256` VARCHAR(64) NULL,
    `text` LONGTEXT NULL,
    `note` VARCHAR(255) NOT NULL,
    `state` VARCHAR(14) NOT NULL,
    `immutable` BOOLEAN NOT NULL DEFAULT false,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ct_doc_versions_doc_id_version_key`(`doc_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_templates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `roles` JSON NOT NULL,
    `approval` VARCHAR(80) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ct_templates_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_template_versions` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `content` LONGTEXT NOT NULL,
    `vars` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ct_template_versions_template_id_version_key`(`template_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_contracts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `cp_kind` VARCHAR(10) NOT NULL,
    `cp_id` VARCHAR(191) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `start_on` DATE NOT NULL,
    `end_on` DATE NULL,
    `notice_days` INTEGER NOT NULL DEFAULT 30,
    `auto_renew` BOOLEAN NOT NULL DEFAULT false,
    `value` DECIMAL(14, 2) NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `sig_state` VARCHAR(20) NOT NULL DEFAULT 'Not sent',
    `apr_state` VARCHAR(20) NOT NULL DEFAULT 'Not requested',
    `doc_id` VARCHAR(191) NULL,
    `template_id` VARCHAR(191) NULL,
    `template_ver` INTEGER NULL,
    `restricted` BOOLEAN NOT NULL DEFAULT false,
    `renewal_of` VARCHAR(191) NULL,
    `renew_state` VARCHAR(20) NULL,
    `renew_note` VARCHAR(500) NULL,
    `snoozed_until` DATE NULL,
    `terminated_on` DATE NULL,
    `signer_draft` JSON NULL,
    `related` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ct_contracts_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `ct_contracts_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_terms` (
    `id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `term` VARCHAR(120) NOT NULL,
    `value` VARCHAR(500) NOT NULL,
    `source` VARCHAR(120) NOT NULL,
    `confidence` DECIMAL(4, 3) NULL,
    `status` VARCHAR(14) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_obligations` (
    `id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `responsible` VARCHAR(14) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `due_on` DATE NOT NULL,
    `frequency` VARCHAR(12) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `evidence_doc_id` VARCHAR(191) NULL,
    `task_id` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_amendments` (
    `id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(12) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `effective_on` DATE NOT NULL,
    `sections` JSON NOT NULL,
    `apr_state` VARCHAR(20) NOT NULL DEFAULT 'Not requested',
    `sig_state` VARCHAR(20) NOT NULL DEFAULT 'Not sent',
    `status` VARCHAR(20) NOT NULL,
    `doc_id` VARCHAR(191) NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_sign_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `doc_id` VARCHAR(191) NOT NULL,
    `doc_version` INTEGER NOT NULL,
    `contract_id` VARCHAR(191) NULL,
    `amendment_id` VARCHAR(191) NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `ordering` VARCHAR(10) NOT NULL,
    `fields` JSON NOT NULL,
    `reminders` VARCHAR(16) NOT NULL,
    `deadline` DATETIME(3) NOT NULL,
    `status` VARCHAR(18) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,
    `doc_sha256` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ct_sign_requests_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `ct_sign_requests_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_signers` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `role` VARCHAR(40) NOT NULL,
    `seq` INTEGER NOT NULL,
    `auth` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `otp_hash` VARCHAR(64) NULL,
    `otp_expires` DATETIME(3) NULL,
    `otp_attempts` INTEGER NOT NULL DEFAULT 0,
    `sent_at` DATETIME(3) NULL,
    `viewed_at` DATETIME(3) NULL,
    `signed_at` DATETIME(3) NULL,
    `declined_at` DATETIME(3) NULL,
    `decline_reason` VARCHAR(500) NULL,
    `sig_type` VARCHAR(8) NULL,
    `sig_data` MEDIUMTEXT NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(255) NULL,
    `last_reminded` DATETIME(3) NULL,

    UNIQUE INDEX `ct_signers_token_hash_key`(`token_hash`),
    INDEX `ct_signers_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_sign_events` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `signer_id` VARCHAR(191) NULL,
    `type` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(500) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ct_sign_events_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `steps` JSON NOT NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `due_on` DATE NOT NULL,
    `status` VARCHAR(18) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `changes` VARCHAR(255) NOT NULL,
    `comments` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ct_approvals_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `ct_approvals_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_compliance` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(12) NOT NULL,
    `doc_id` VARCHAR(191) NULL,
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `jurisdiction` VARCHAR(80) NOT NULL,
    `owner_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `effective_on` DATE NULL,
    `expires_on` DATE NULL,
    `mandatory_ack` BOOLEAN NOT NULL DEFAULT false,
    `audience` VARCHAR(80) NOT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ct_compliance_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_acks` (
    `id` VARCHAR(191) NOT NULL,
    `compliance_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(14) NOT NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acked_at` DATETIME(3) NULL,

    UNIQUE INDEX `ct_acks_compliance_id_user_id_version_key`(`compliance_id`, `user_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_expiry_states` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `state` VARCHAR(20) NOT NULL,
    `note` VARCHAR(500) NULL,
    `snoozed_until` DATE NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ct_expiry_states_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_name` VARCHAR(160) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity_type` VARCHAR(16) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL,
    `correlation` VARCHAR(24) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ct_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `ct_audit_business_id_entity_id_idx`(`business_id`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ct_idem` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `result` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ct_idem_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ct_doc_versions` ADD CONSTRAINT `ct_doc_versions_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `ct_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_template_versions` ADD CONSTRAINT `ct_template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `ct_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_terms` ADD CONSTRAINT `ct_terms_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `ct_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_obligations` ADD CONSTRAINT `ct_obligations_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `ct_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_amendments` ADD CONSTRAINT `ct_amendments_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `ct_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_signers` ADD CONSTRAINT `ct_signers_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `ct_sign_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_sign_events` ADD CONSTRAINT `ct_sign_events_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `ct_sign_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ct_acks` ADD CONSTRAINT `ct_acks_compliance_id_fkey` FOREIGN KEY (`compliance_id`) REFERENCES `ct_compliance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

