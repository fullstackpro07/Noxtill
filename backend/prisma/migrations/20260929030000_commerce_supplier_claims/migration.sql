CREATE TABLE `commerce_supplier_claims` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `purchase_order_id` VARCHAR(191) NULL,
  `reference` VARCHAR(191) NULL,
  `reason_code` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `status` ENUM('draft', 'submitted', 'acknowledged', 'partially_settled', 'settled', 'rejected', 'closed') NOT NULL DEFAULT 'draft',
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_by_user_id` VARCHAR(191) NULL,
  `submitted_at` DATETIME(3) NULL,
  `acknowledged_at` DATETIME(3) NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commerce_supplier_claims_biz_status_updated_idx` (`business_id`, `status`, `updated_at`),
  INDEX `commerce_supplier_claims_biz_supplier_created_idx` (`business_id`, `supplier_id`, `created_at`),
  INDEX `commerce_supplier_claims_po_idx` (`purchase_order_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claims_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_claims_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_claims_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_claim_items` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `purchase_order_item_id` VARCHAR(191) NULL,
  `product_id` VARCHAR(191) NULL,
  `description` TEXT NOT NULL,
  `quantity_affected` INTEGER NOT NULL DEFAULT 1,
  `product_loss_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `freight_loss_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `other_loss_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_supplier_claim_items_claim_idx` (`claim_id`),
  INDEX `commerce_supplier_claim_items_product_idx` (`product_id`),
  INDEX `commerce_supplier_claim_items_po_item_idx` (`purchase_order_item_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claim_items_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `commerce_supplier_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_claim_items_purchase_order_item_id_fkey` FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_claim_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_claim_evidence` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `evidence_type` ENUM('photo', 'invoice', 'delivery_record', 'inspection_report', 'correspondence', 'other') NOT NULL,
  `file_key` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `sha256` CHAR(64) NULL,
  `added_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_supplier_claim_evidence_claim_created_idx` (`claim_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claim_evidence_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `commerce_supplier_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_claim_communications` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `channel` ENUM('email', 'phone', 'portal', 'messaging', 'other') NOT NULL,
  `direction` ENUM('inbound', 'outbound', 'internal') NOT NULL,
  `summary` TEXT NOT NULL,
  `provider_message_id` VARCHAR(191) NULL,
  `provider_state` VARCHAR(191) NULL,
  `recorded_by_user_id` VARCHAR(191) NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_supplier_claim_comms_claim_occurred_idx` (`claim_id`, `occurred_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claim_communications_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `commerce_supplier_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_claim_settlements` (
  `id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `settlement_type` ENUM('credit', 'refund', 'replacement', 'other') NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `financial_reference` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `recorded_by_user_id` VARCHAR(191) NULL,
  `settled_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_supplier_claim_settlements_claim_settled_idx` (`claim_id`, `settled_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claim_settlements_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `commerce_supplier_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_claim_audits` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `claim_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `reason` TEXT NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_supplier_claim_audits_biz_claim_created_idx` (`business_id`, `claim_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_claim_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_claim_audits_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `commerce_supplier_claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
