-- Create only the IVR Studio tables from the Prisma diff. Existing unrelated FK/index drift
-- (commerce RFQ, notification preferences and index renames) is intentionally excluded.
CREATE TABLE `voice_ivr_flows` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `revision` INTEGER NOT NULL DEFAULT 0,
    `published_version` INTEGER NULL,
    `draft_graph` JSON NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_ivr_flows_business_status_idx`(`business_id`, `status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_ivr_flow_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `flow_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `graph` JSON NOT NULL,
    `status` ENUM('published', 'rollback') NOT NULL DEFAULT 'published',
    `change_summary` VARCHAR(500) NOT NULL,
    `rollback_source_version` INTEGER NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `voice_ivr_flow_versions_business_flow_idx`(`business_id`, `flow_id`, `published_at`),
    UNIQUE INDEX `voice_ivr_flow_versions_flow_version_key`(`flow_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_ivr_flows`
    ADD CONSTRAINT `voice_ivr_flows_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_ivr_flow_versions`
    ADD CONSTRAINT `voice_ivr_flow_versions_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_ivr_flow_versions`
    ADD CONSTRAINT `voice_ivr_flow_versions_flow_id_fkey`
    FOREIGN KEY (`flow_id`) REFERENCES `voice_ivr_flows`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
