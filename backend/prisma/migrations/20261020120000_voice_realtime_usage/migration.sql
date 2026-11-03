CREATE TABLE `voice_realtime_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `call_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `stream_sid` VARCHAR(40) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `error_code` VARCHAR(80) NULL,
  `metrics` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_realtime_sessions_call_id_key` (`call_id`),
  INDEX `voice_realtime_sessions_business_status_idx` (`business_id`, `status`, `created_at`),
  CONSTRAINT `voice_realtime_sessions_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_usage_records` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `call_id` VARCHAR(191) NULL,
  `event_key` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `unit` VARCHAR(64) NOT NULL,
  `quantity` DECIMAL(18,6) NOT NULL,
  `cost` DECIMAL(14,6) NULL,
  `currency` VARCHAR(3) NULL,
  `state` VARCHAR(24) NOT NULL,
  `evidence` JSON NOT NULL,
  `measured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `voice_usage_records_business_event_key` (`business_id`, `event_key`),
  INDEX `voice_usage_records_business_measured_unit_idx` (`business_id`, `measured_at`, `unit`),
  CONSTRAINT `voice_usage_records_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `phone_calls` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
