CREATE TABLE `procurement_supplier_contracts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `status` ENUM('draft', 'active', 'terminated') NOT NULL DEFAULT 'draft',
    `document_url` VARCHAR(1000) NULL,
    `effective_from` DATE NOT NULL,
    `expires_at` DATE NULL,
    `auto_renew` BOOLEAN NOT NULL DEFAULT false,
    `notice_days` INTEGER NULL,
    `currency` CHAR(3) NOT NULL,
    `payment_terms` VARCHAR(200) NULL,
    `discount_tiers` JSON NOT NULL,
    `price_valid_until` DATE NULL,
    `minimum_order_qty` INTEGER NULL,
    `sla` TEXT NULL,
    `delivery_terms` VARCHAR(300) NULL,
    `incoterms` VARCHAR(20) NULL,
    `warranty` VARCHAR(300) NULL,
    `compliance_requirements` JSON NOT NULL,
    `categories` JSON NOT NULL,
    `owner_user_id` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `terms_confirmed_at` DATETIME(3) NULL,
    `terms_confirmed_by_user_id` VARCHAR(191) NULL,
    `renewal_alerted_for` DATE NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `procurement_supplier_contracts_business_id_supplier_id_idx`(`business_id`, `supplier_id`),
    INDEX `procurement_supplier_contracts_business_id_status_expires_at_idx`(`business_id`, `status`, `expires_at`),
    UNIQUE INDEX `procurement_supplier_contracts_business_id_reference_key`(`business_id`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `procurement_supplier_contract_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `terms` JSON NOT NULL,
    `reason` VARCHAR(300) NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `procurement_supplier_contract_versions_business_id_idx`(`business_id`),
    UNIQUE INDEX `procurement_supplier_contract_versions_contract_id_version_key`(`contract_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `procurement_supplier_contracts` ADD CONSTRAINT `procurement_supplier_contracts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `procurement_supplier_contracts` ADD CONSTRAINT `procurement_supplier_contracts_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `procurement_supplier_contract_versions` ADD CONSTRAINT `procurement_supplier_contract_versions_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `procurement_supplier_contract_versions` ADD CONSTRAINT `procurement_supplier_contract_versions_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `procurement_supplier_contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
