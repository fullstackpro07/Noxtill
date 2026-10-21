CREATE TABLE `customer_support_tickets` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NOT NULL,
  `source_call_id` VARCHAR(191) NULL,
  `source_key` VARCHAR(191) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `body` TEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'open',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_support_tickets_business_source_key` (`business_id`, `source_key`),
  INDEX `customer_support_tickets_business_customer_status_idx` (`business_id`, `customer_id`, `status`),
  CONSTRAINT `customer_support_tickets_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_support_tickets_source_call_id_fkey` FOREIGN KEY (`source_call_id`) REFERENCES `phone_calls` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `message_drafts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NOT NULL,
  `source_call_id` VARCHAR(191) NULL,
  `source_key` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `message_drafts_business_source_key` (`business_id`, `source_key`),
  INDEX `message_drafts_business_customer_status_idx` (`business_id`, `customer_id`, `status`),
  CONSTRAINT `message_drafts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `message_drafts_source_call_id_fkey` FOREIGN KEY (`source_call_id`) REFERENCES `phone_calls` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
