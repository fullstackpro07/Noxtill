-- Campaign tracking numbers with time-windowed assignment history; calls remember the dialed number.
CREATE TABLE `voice_tracking_numbers` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `phone_number` VARCHAR(16) NOT NULL,
  `twilio_sid` VARCHAR(64) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(191) NOT NULL,
  `campaign_id` VARCHAR(191) NULL,
  `provisioned_via` VARCHAR(20) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `deactivated_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `voice_tracking_numbers_phone_number_key`(`phone_number`),
  INDEX `voice_tracking_number_business_idx`(`business_id`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_tracking_number_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `number_id` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(191) NOT NULL,
  `campaign_id` VARCHAR(191) NULL,
  `valid_from` DATETIME(3) NOT NULL,
  `valid_to` DATETIME(3) NULL,
  `reason` VARCHAR(500) NOT NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `voice_tracking_assignment_window_idx`(`business_id`, `number_id`, `valid_from`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_tracking_numbers`
  ADD CONSTRAINT `voice_tracking_numbers_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_tracking_numbers_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `voice_tracking_number_assignments`
  ADD CONSTRAINT `voice_tracking_number_assignments_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_tracking_number_assignments_number_id_fkey` FOREIGN KEY (`number_id`) REFERENCES `voice_tracking_numbers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `phone_calls`
  ADD COLUMN `tracking_number_id` VARCHAR(191) NULL,
  ADD INDEX `phone_calls_tracking_number_id_idx` (`tracking_number_id`),
  ADD CONSTRAINT `phone_calls_tracking_number_id_fkey` FOREIGN KEY (`tracking_number_id`) REFERENCES `voice_tracking_numbers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
