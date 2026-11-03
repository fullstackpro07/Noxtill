CREATE TABLE `commerce_rfqs` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `requirement` TEXT NOT NULL,
  `status` ENUM('draft', 'open', 'awarded', 'closed', 'cancelled') NOT NULL DEFAULT 'draft',
  `market` VARCHAR(191) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `destination` TEXT NULL,
  `terms` TEXT NULL,
  `due_at` DATETIME(3) NULL,
  `owner_user_id` VARCHAR(191) NULL,
  `source_opportunity_id` VARCHAR(191) NULL,
  `awarded_quote_id` VARCHAR(191) NULL,
  `purchase_order_id` VARCHAR(191) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `commerce_rfqs_awarded_quote_id_key` (`awarded_quote_id`),
  UNIQUE INDEX `commerce_rfqs_purchase_order_id_key` (`purchase_order_id`),
  INDEX `commerce_rfqs_business_id_status_updated_at_idx` (`business_id`, `status`, `updated_at`),
  INDEX `commerce_rfqs_business_id_due_at_idx` (`business_id`, `due_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_rfqs_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_rfqs_source_opportunity_id_fkey` FOREIGN KEY (`source_opportunity_id`) REFERENCES `product_opportunities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `commerce_rfqs_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_rfq_items` (
  `id` VARCHAR(191) NOT NULL,
  `rfq_id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NULL,
  `description` TEXT NOT NULL,
  `qty` INTEGER NOT NULL,
  `minimum_qty` INTEGER NULL,
  `specifications` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_rfq_items_rfq_id_idx` (`rfq_id`),
  INDEX `commerce_rfq_items_product_id_idx` (`product_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_rfq_items_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `commerce_rfqs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_rfq_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_rfq_suppliers` (
  `id` VARCHAR(191) NOT NULL,
  `rfq_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `status` ENUM('pending_send', 'sent', 'responded', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending_send',
  `invited_at` DATETIME(3) NULL,
  `responded_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `commerce_rfq_suppliers_rfq_id_supplier_id_key` (`rfq_id`, `supplier_id`),
  INDEX `commerce_rfq_suppliers_supplier_id_status_idx` (`supplier_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_rfq_suppliers_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `commerce_rfqs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_rfq_suppliers_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_quotes` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `rfq_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `invitation_id` VARCHAR(191) NOT NULL,
  `status` ENUM('submitted', 'shortlisted', 'awarded', 'rejected', 'withdrawn') NOT NULL DEFAULT 'submitted',
  `currency` CHAR(3) NOT NULL,
  `valid_until` DATETIME(3) NULL,
  `payment_terms` TEXT NULL,
  `freight` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `duties` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `lead_time_days` INTEGER NULL,
  `notes` TEXT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `commerce_supplier_quotes_invitation_id_key` (`invitation_id`),
  INDEX `commerce_supplier_quotes_business_id_rfq_id_status_idx` (`business_id`, `rfq_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_quotes_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_quotes_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `commerce_rfqs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_quotes_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_quotes_invitation_id_fkey` FOREIGN KEY (`invitation_id`) REFERENCES `commerce_rfq_suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_supplier_quote_items` (
  `id` VARCHAR(191) NOT NULL,
  `quote_id` VARCHAR(191) NOT NULL,
  `rfq_item_id` VARCHAR(191) NOT NULL,
  `quoted_qty` INTEGER NOT NULL,
  `minimum_qty` INTEGER NULL,
  `unit_price` DECIMAL(12, 2) NOT NULL,
  UNIQUE INDEX `commerce_supplier_quote_items_quote_id_rfq_item_id_key` (`quote_id`, `rfq_item_id`),
  INDEX `commerce_supplier_quote_items_rfq_item_id_idx` (`rfq_item_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_supplier_quote_items_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `commerce_supplier_quotes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commerce_supplier_quote_items_rfq_item_id_fkey` FOREIGN KEY (`rfq_item_id`) REFERENCES `commerce_rfq_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commerce_rfq_audits` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `rfq_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `reason` TEXT NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `commerce_rfq_audits_business_id_rfq_id_created_at_idx` (`business_id`, `rfq_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `commerce_rfq_audits_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commerce_rfq_audits_rfq_id_fkey` FOREIGN KEY (`rfq_id`) REFERENCES `commerce_rfqs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commerce_rfqs`
  ADD CONSTRAINT `commerce_rfqs_awarded_quote_id_fkey` FOREIGN KEY (`awarded_quote_id`) REFERENCES `commerce_supplier_quotes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `activity_events`
  MODIFY `type` ENUM(
    'sale', 'booking', 'review', 'payment', 'complaint', 'stock', 'low_stock',
    'customer_lapsed', 'credit_overdue', 'birthday', 'delivery',
    'commerce_validation', 'seo_issue_detected', 'commerce_rfq_created',
    'commerce_rfq_awarded'
  ) NOT NULL;

ALTER TABLE `workflows`
  MODIFY `trigger_key` ENUM(
    'sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review',
    'credit_overdue', 'birthday', 'payment_received', 'complaint_received',
    'stock_changed', 'delivery_created', 'delivery_assigned',
    'delivery_picked_up', 'delivery_en_route', 'delivery_delivered',
    'delivery_failed', 'delivery_retried', 'commerce_validation',
    'seo_issue_detected', 'commerce_rfq_created', 'commerce_rfq_awarded'
  ) NOT NULL;

ALTER TABLE `workflow_versions`
  MODIFY `trigger_key` ENUM(
    'sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review',
    'credit_overdue', 'birthday', 'payment_received', 'complaint_received',
    'stock_changed', 'delivery_created', 'delivery_assigned',
    'delivery_picked_up', 'delivery_en_route', 'delivery_delivered',
    'delivery_failed', 'delivery_retried', 'commerce_validation',
    'seo_issue_detected', 'commerce_rfq_created', 'commerce_rfq_awarded'
  ) NOT NULL;
