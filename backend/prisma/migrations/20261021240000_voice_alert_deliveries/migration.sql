-- External delivery log for platform operations alerts (one row per source alert).
CREATE TABLE `voice_alert_deliveries` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `source_key` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(40) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `delivered_at` DATETIME(3) NULL,
  `last_error` VARCHAR(300) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `voice_alert_deliveries_source_key_key`(`source_key`),
  INDEX `voice_alert_delivery_pending_idx`(`delivered_at`, `attempts`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
