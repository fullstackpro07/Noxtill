CREATE TABLE `voice_provider_webhook_events` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `event_key` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `call_sid` VARCHAR(191) NOT NULL,
  `sequence_number` INTEGER NULL,
  `payload` JSON NOT NULL,
  `state` VARCHAR(20) NOT NULL DEFAULT 'received',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `consecutive_failures` INTEGER NOT NULL DEFAULT 0,
  `replay_count` INTEGER NOT NULL DEFAULT 0,
  `last_error` TEXT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_attempt_at` DATETIME(3) NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `processing_until` DATETIME(3) NULL,
  `processed_at` DATETIME(3) NULL,
  INDEX `voice_provider_webhook_business_state_idx` (`business_id`, `state`, `received_at`),
  INDEX `voice_provider_webhook_retry_idx` (`state`, `next_attempt_at`, `processing_until`),
  UNIQUE INDEX `voice_provider_webhook_business_event_key` (`business_id`, `event_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_provider_webhook_events`
  ADD CONSTRAINT `voice_provider_webhook_events_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
