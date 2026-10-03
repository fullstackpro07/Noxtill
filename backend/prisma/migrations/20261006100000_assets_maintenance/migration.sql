-- AlterTable
ALTER TABLE `stock_movements` MODIFY `kind` ENUM('purchase', 'sale', 'wastage', 'adjustment', 'return', 'transfer_out', 'transfer_in', 'maintenance') NOT NULL;

-- AlterTable
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'finance_approval', 'payment_approval', 'payment_dispute_due', 'payment_failed', 'asset_pm_overdue', 'asset_down_critical', 'asset_wo_approval') NOT NULL;

-- CreateTable
CREATE TABLE `am_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `next_asset` INTEGER NOT NULL DEFAULT 1,
    `next_req` INTEGER NOT NULL DEFAULT 1,
    `next_wo` INTEGER NOT NULL DEFAULT 1,
    `next_pm` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `am_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_settings_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `changed` JSON NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_settings_versions_business_id_version_key`(`business_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_categories` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(24) NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `criticality` VARCHAR(10) NOT NULL DEFAULT 'Medium',
    `template_id` VARCHAR(191) NULL,
    `warranty_type` VARCHAR(24) NULL,
    `life_years` INTEGER NULL,
    `description` TEXT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `am_categories_business_id_code_key`(`business_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_locations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `parent_id` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_locations_business_id_branch_id_idx`(`business_id`, `branch_id`),
    UNIQUE INDEX `am_locations_business_id_code_key`(`business_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_teams` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_teams_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_team_members` (
    `id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `am_team_members_team_id_user_id_key`(`team_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_pm_templates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `checklist` JSON NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_pm_templates_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_custom_fields` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `options` JSON NOT NULL,
    `category_ids` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_custom_fields_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_assets` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NOT NULL,
    `tag` VARCHAR(60) NULL,
    `barcode` VARCHAR(80) NULL,
    `serial` VARCHAR(80) NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `category_id` VARCHAR(191) NULL,
    `owner_type` VARCHAR(20) NOT NULL DEFAULT 'Business-owned',
    `customer_id` VARCHAR(191) NULL,
    `branch_id` VARCHAR(191) NULL,
    `location_id` VARCHAR(191) NULL,
    `manufacturer` VARCHAR(80) NULL,
    `model` VARCHAR(80) NULL,
    `status` VARCHAR(20) NOT NULL,
    `condition` VARCHAR(10) NOT NULL DEFAULT 'Good',
    `criticality` VARCHAR(10) NOT NULL DEFAULT 'Medium',
    `purchased_on` DATE NULL,
    `installed_on` DATE NULL,
    `cost` DECIMAL(14, 2) NULL,
    `warranty_provider` VARCHAR(120) NULL,
    `warranty_type` VARCHAR(24) NULL,
    `warranty_start` DATE NULL,
    `warranty_end` DATE NULL,
    `meter_type` VARCHAR(24) NULL,
    `meter_unit` VARCHAR(12) NULL,
    `team_id` VARCHAR(191) NULL,
    `parent_id` VARCHAR(191) NULL,
    `product_id` VARCHAR(191) NULL,
    `fin_asset_id` VARCHAR(191) NULL,
    `custom` JSON NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_assets_business_id_status_idx`(`business_id`, `status`),
    INDEX `am_assets_business_id_branch_id_idx`(`business_id`, `branch_id`),
    UNIQUE INDEX `am_assets_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_documents` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `storage_key` VARCHAR(400) NOT NULL,
    `mime` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `am_documents_business_id_asset_id_idx`(`business_id`, `asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_readings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `value` DECIMAL(14, 2) NOT NULL,
    `taken_at` DATETIME(3) NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `correction_of_id` VARCHAR(191) NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `am_readings_business_id_asset_id_taken_at_idx`(`business_id`, `asset_id`, `taken_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_requests` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `issue_type` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `priority` VARCHAR(10) NOT NULL,
    `safety` BOOLEAN NOT NULL DEFAULT false,
    `down` BOOLEAN NOT NULL DEFAULT false,
    `observed` VARCHAR(10) NULL,
    `reporter_id` VARCHAR(191) NOT NULL,
    `triage_id` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `preferred_on` DATE NULL,
    `triaged_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_requests_business_id_status_idx`(`business_id`, `status`),
    INDEX `am_requests_business_id_asset_id_idx`(`business_id`, `asset_id`),
    UNIQUE INDEX `am_requests_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_request_notes` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_work_orders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `priority` VARCHAR(10) NOT NULL,
    `safety` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(20) NOT NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `team_id` VARCHAR(191) NULL,
    `supplier_id` VARCHAR(191) NULL,
    `scheduled_at` DATETIME(3) NULL,
    `due_at` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `expected_down_h` DECIMAL(8, 2) NULL,
    `request_id` VARCHAR(191) NULL,
    `pm_plan_id` VARCHAR(191) NULL,
    `pm_key` VARCHAR(80) NULL,
    `scope` TEXT NOT NULL,
    `outcome` VARCHAR(30) NULL,
    `work_done` TEXT NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_work_orders_business_id_status_idx`(`business_id`, `status`),
    INDEX `am_work_orders_business_id_asset_id_idx`(`business_id`, `asset_id`),
    UNIQUE INDEX `am_work_orders_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_wo_checklist` (
    `id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `text` VARCHAR(255) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `done_by_id` VARCHAR(191) NULL,
    `done_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_wo_parts` (
    `id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `planned` INTEGER NOT NULL,
    `issued` INTEGER NOT NULL DEFAULT 0,
    `used` INTEGER NOT NULL DEFAULT 0,
    `returned` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_wo_part_moves` (
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
CREATE TABLE `am_wo_labor` (
    `id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `hours` DECIMAL(8, 2) NOT NULL,
    `rate` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_wo_costs` (
    `id` VARCHAR(191) NOT NULL,
    `wo_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(10) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `source` VARCHAR(60) NOT NULL,
    `fin_bill_id` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_pm_plans` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NULL,
    `trigger` VARCHAR(8) NOT NULL,
    `interval` INTEGER NOT NULL,
    `unit` VARCHAR(10) NOT NULL,
    `next_due_on` DATE NULL,
    `next_due_meter` DECIMAL(14, 2) NULL,
    `meter_interval` DECIMAL(14, 2) NULL,
    `tolerance` VARCHAR(40) NOT NULL,
    `assignee_user_id` VARCHAR(191) NULL,
    `team_id` VARCHAR(191) NULL,
    `supplier_id` VARCHAR(191) NULL,
    `auto_create` BOOLEAN NOT NULL DEFAULT true,
    `lead_days` INTEGER NOT NULL DEFAULT 7,
    `status` VARCHAR(24) NOT NULL,
    `last_done_on` DATE NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `am_pm_plans_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `am_pm_plans_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_pm_instances` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_pm_instances_plan_id_key_key`(`plan_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `summary` TEXT NOT NULL,
    `cond_before` VARCHAR(10) NULL,
    `cond_after` VARCHAR(10) NULL,
    `result` VARCHAR(24) NULL,
    `score` INTEGER NULL,
    `findings` TEXT NULL,
    `checklist_ref` VARCHAR(80) NULL,
    `critical` BOOLEAN NOT NULL DEFAULT false,
    `wo_id` VARCHAR(191) NULL,
    `by_user_id` VARCHAR(191) NULL,
    `by_supplier_id` VARCHAR(191) NULL,
    `by_team_id` VARCHAR(191) NULL,
    `from_location_id` VARCHAR(191) NULL,
    `to_location_id` VARCHAR(191) NULL,
    `extra` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `am_events_business_id_occurred_at_idx`(`business_id`, `occurred_at`),
    INDEX `am_events_business_id_asset_id_idx`(`business_id`, `asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_downtime` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `start_at` DATETIME(3) NOT NULL,
    `end_at` DATETIME(3) NULL,
    `kind` VARCHAR(10) NOT NULL,
    `reason` VARCHAR(30) NOT NULL,
    `cause` VARCHAR(255) NOT NULL,
    `wo_id` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NULL,
    `impact` VARCHAR(255) NULL,
    `escalated_at` DATETIME(3) NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `am_downtime_business_id_asset_id_idx`(`business_id`, `asset_id`),
    INDEX `am_downtime_business_id_end_at_idx`(`business_id`, `end_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_name` VARCHAR(160) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `correlation` VARCHAR(24) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `am_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `am_audit_business_id_entity_id_idx`(`business_id`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_saved_views` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `filters` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_saved_views_business_id_user_id_name_key`(`business_id`, `user_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `am_insight_dismissals` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `am_insight_dismissals_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `am_team_members` ADD CONSTRAINT `am_team_members_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `am_teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_request_notes` ADD CONSTRAINT `am_request_notes_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `am_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_wo_checklist` ADD CONSTRAINT `am_wo_checklist_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `am_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_wo_parts` ADD CONSTRAINT `am_wo_parts_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `am_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_wo_part_moves` ADD CONSTRAINT `am_wo_part_moves_part_id_fkey` FOREIGN KEY (`part_id`) REFERENCES `am_wo_parts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_wo_labor` ADD CONSTRAINT `am_wo_labor_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `am_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_wo_costs` ADD CONSTRAINT `am_wo_costs_wo_id_fkey` FOREIGN KEY (`wo_id`) REFERENCES `am_work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `am_pm_instances` ADD CONSTRAINT `am_pm_instances_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `am_pm_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

