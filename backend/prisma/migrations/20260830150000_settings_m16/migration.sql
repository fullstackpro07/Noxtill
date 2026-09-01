ALTER TABLE `businesses`
  ADD COLUMN `phone` VARCHAR(191) NULL,
  ADD COLUMN `address` VARCHAR(191) NULL,
  ADD COLUMN `nightly_close_config` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN `channel_priority` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN `template_approvals` JSON NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN `add_ons` JSON NOT NULL DEFAULT (JSON_ARRAY());

CREATE TABLE `notification_preferences` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `event` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(191) NOT NULL DEFAULT 'in_app',
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `notification_preferences_business_id_user_id_event_channel_key`(`business_id`, `user_id`, `event`, `channel`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `data_subject_requests` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `customer_id` VARCHAR(191) NOT NULL,
  `kind` ENUM('export', 'erasure') NOT NULL,
  `status` ENUM('pending', 'in_progress', 'fulfilled', 'rejected') NOT NULL DEFAULT 'pending',
  `requested_by_user_id` VARCHAR(191) NULL,
  `fulfilled_at` DATETIME(3) NULL,
  `result_url` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `data_subject_requests_business_id_status_idx`(`business_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tax_rules` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NULL,
  `label` VARCHAR(191) NOT NULL,
  `rate` DECIMAL(5, 2) NOT NULL,
  `tax_inclusive` BOOLEAN NOT NULL DEFAULT false,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `tax_rules_business_id_category_idx`(`business_id`, `category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notification_preferences`
  ADD CONSTRAINT `notification_preferences_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `data_subject_requests`
  ADD CONSTRAINT `data_subject_requests_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `data_subject_requests_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tax_rules`
  ADD CONSTRAINT `tax_rules_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
