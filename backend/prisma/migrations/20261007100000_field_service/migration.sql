-- AlterTable
ALTER TABLE `stock_movements` MODIFY `kind` ENUM('purchase', 'sale', 'wastage', 'adjustment', 'return', 'transfer_out', 'transfer_in', 'maintenance', 'field_service') NOT NULL;

-- AlterTable
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'finance_approval', 'payment_approval', 'payment_dispute_due', 'payment_failed', 'asset_pm_overdue', 'asset_down_critical', 'asset_wo_approval', 'field_approval', 'field_sla_breach', 'field_unassigned_urgent') NOT NULL;

-- CreateTable
CREATE TABLE `fs_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `next_wo` INTEGER NOT NULL DEFAULT 1,
    `next_sr` INTEGER NOT NULL DEFAULT 1,
    `next_agr` INTEGER NOT NULL DEFAULT 1,
    `next_wrn` INTEGER NOT NULL DEFAULT 1,
    `next_pm` INTEGER NOT NULL DEFAULT 1,
    `next_ins` INTEGER NOT NULL DEFAULT 1,
    `next_lab` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_settings_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `changed` JSON NOT NULL,
    `reason` VARCHAR(500) NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fs_settings_versions_business_id_version_key`(`business_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_service_types` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `skill` VARCHAR(40) NOT NULL,
    `cert` VARCHAR(60) NULL,
    `dur_min` INTEGER NOT NULL,
    `template_id` VARCHAR(191) NULL,
    `priority` VARCHAR(10) NOT NULL DEFAULT 'Normal',
    `proof` VARCHAR(60) NOT NULL DEFAULT 'Signature',
    `part_product_ids` JSON NOT NULL,
    `labor_product_id` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_service_types_business_id_code_key`(`business_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_technicians` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `skills` JSON NOT NULL,
    `certs` JSON NOT NULL,
    `territories` JSON NOT NULL,
    `shift_start` DECIMAL(4, 2) NOT NULL DEFAULT 9,
    `shift_end` DECIMAL(4, 2) NOT NULL DEFAULT 18,
    `tracking` BOOLEAN NOT NULL DEFAULT true,
    `manual_status` VARCHAR(12) NULL,
    `last_zone` VARCHAR(60) NULL,
    `last_zone_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_technicians_business_id_user_id_key`(`business_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_sites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `zone` VARCHAR(60) NOT NULL,
    `access` TEXT NULL,
    `safety` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fs_sites_business_id_customer_id_idx`(`business_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_equipment_sites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fs_equipment_sites_asset_id_key`(`asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `issue` TEXT NOT NULL,
    `service_type_id` VARCHAR(191) NULL,
    `channel` VARCHAR(20) NOT NULL,
    `source_ref` VARCHAR(80) NULL,
    `priority` VARCHAR(10) NOT NULL,
    `window` VARCHAR(80) NULL,
    `status` VARCHAR(24) NOT NULL,
    `owner_id` VARCHAR(191) NULL,
    `triage_result` VARCHAR(40) NULL,
    `outcome` VARCHAR(255) NULL,
    `notes` JSON NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `helpdesk_ticket_id` VARCHAR(191) NULL,
    `triaged_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fs_requests_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `fs_requests_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_work_orders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `request_id` VARCHAR(191) NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `service_type_id` VARCHAR(191) NOT NULL,
    `priority` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `tech_user_id` VARCHAR(191) NULL,
    `start_at` DATETIME(3) NULL,
    `dur_min` INTEGER NOT NULL,
    `sla_due_at` DATETIME(3) NULL,
    `sla_paused_ms` BIGINT NOT NULL DEFAULT 0,
    `sla_paused_at` DATETIME(3) NULL,
    `scope` TEXT NOT NULL,
    `agreement_id` VARCHAR(191) NULL,
    `warranty_id` VARCHAR(191) NULL,
    `plan_id` VARCHAR(191) NULL,
    `plan_key` VARCHAR(80) NULL,
    `quote_order_id` VARCHAR(191) NULL,
    `invoice_order_id` VARCHAR(191) NULL,
    `pay_request_id` VARCHAR(191) NULL,
    `template_id` VARCHAR(191) NULL,
    `template_version` INTEGER NULL,
    `checklist` JSON NOT NULL,
    `checklist_notes` JSON NOT NULL,
    `signed_by` VARCHAR(120) NULL,
    `signed_at` DATETIME(3) NULL,
    `sign_note` VARCHAR(255) NULL,
    `resolution` TEXT NULL,
    `note` TEXT NULL,
    `approval_reason` VARCHAR(255) NULL,
    `unresolved` BOOLEAN NOT NULL DEFAULT false,
    `dispatched_at` DATETIME(3) NULL,
    `arrived_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fs_work_orders_business_id_status_idx`(`business_id`, `status`),
    INDEX `fs_work_orders_business_id_tech_user_id_idx`(`business_id`, `tech_user_id`),
    UNIQUE INDEX `fs_work_orders_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_wo_parts` (
    `id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `required` INTEGER NOT NULL,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `issued` INTEGER NOT NULL DEFAULT 0,
    `used` INTEGER NOT NULL DEFAULT 0,
    `returned` INTEGER NOT NULL DEFAULT 0,
    `purchase_order_id` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_part_moves` (
    `id` VARCHAR(191) NOT NULL,
    `part_id` VARCHAR(191) NOT NULL,
    `stock_movement_id` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_labor` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `tech_user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NULL,
    `break_min` INTEGER NOT NULL DEFAULT 0,
    `billable` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(12) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `overtime` BOOLEAN NOT NULL DEFAULT false,
    `rate` DECIMAL(10, 2) NULL,
    `decided_by_id` VARCHAR(191) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `fs_labor_business_id_wo_id_idx`(`business_id`, `wo_id`),
    INDEX `fs_labor_business_id_tech_user_id_idx`(`business_id`, `tech_user_id`),
    UNIQUE INDEX `fs_labor_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `by_user_id` VARCHAR(191) NULL,
    `by_name` VARCHAR(160) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fs_events_business_id_wo_id_idx`(`business_id`, `wo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_files` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NULL,
    `warranty_id` VARCHAR(191) NULL,
    `stage` VARCHAR(12) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `storage_key` VARCHAR(400) NOT NULL,
    `mime` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fs_files_business_id_wo_id_idx`(`business_id`, `wo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_templates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(24) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `service_type_id` VARCHAR(191) NULL,
    `asset_type` VARCHAR(40) NOT NULL DEFAULT 'Any',
    `version` INTEGER NOT NULL,
    `items` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_templates_business_id_code_version_key`(`business_id`, `code`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_inspections` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NULL,
    `tech_user_id` VARCHAR(191) NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `result` VARCHAR(24) NOT NULL,
    `exceptions` INTEGER NOT NULL DEFAULT 0,
    `approved_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_inspections_wo_id_key`(`wo_id`),
    UNIQUE INDEX `fs_inspections_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_plans` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NULL,
    `asset_id` VARCHAR(191) NULL,
    `service_type_id` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(16) NOT NULL,
    `freq` INTEGER NOT NULL,
    `next_due_on` DATE NULL,
    `next_due_meter` DECIMAL(14, 2) NULL,
    `window` VARCHAR(60) NOT NULL DEFAULT 'Any',
    `auto_create` BOOLEAN NOT NULL DEFAULT true,
    `approval` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(10) NOT NULL,
    `last_wo_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_plans_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_plan_instances` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fs_plan_instances_plan_id_key_key`(`plan_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_agreements` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NULL,
    `start_on` DATE NOT NULL,
    `end_on` DATE NOT NULL,
    `asset_ids` JSON NOT NULL,
    `service_type_ids` JSON NOT NULL,
    `visits` INTEGER NOT NULL,
    `freq` VARCHAR(40) NOT NULL,
    `resp_h` INTEGER NOT NULL,
    `res_h` INTEGER NOT NULL,
    `labor` VARCHAR(60) NOT NULL,
    `parts` VARCHAR(60) NOT NULL,
    `renewal` VARCHAR(16) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_agreements_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_warranty` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `issue` TEXT NOT NULL,
    `source` VARCHAR(80) NOT NULL,
    `eligibility` VARCHAR(20) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL,
    `evidence` JSON NOT NULL,
    `note` TEXT NULL,
    `history` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_warranty_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `subject_type` VARCHAR(12) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `what` VARCHAR(255) NOT NULL,
    `payload` JSON NOT NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `decided_by_id` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fs_approvals_business_id_status_idx`(`business_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_audit` (
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

    INDEX `fs_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `fs_audit_business_id_entity_id_idx`(`business_id`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fs_idem` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `result` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fs_idem_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fs_wo_parts` ADD CONSTRAINT `fs_wo_parts_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `fs_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fs_part_moves` ADD CONSTRAINT `fs_part_moves_part_id_fkey` FOREIGN KEY (`part_id`) REFERENCES `fs_wo_parts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fs_plan_instances` ADD CONSTRAINT `fs_plan_instances_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `fs_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

