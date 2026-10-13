CREATE TABLE `voice_call_wrapups` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `call_id` VARCHAR(191) NOT NULL,
  `disposition` ENUM('resolved', 'callback_requested', 'booked', 'escalated', 'not_interested', 'wrong_number', 'other') NOT NULL,
  `tags` JSON NOT NULL,
  `notes` TEXT NULL,
  `completed_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `voice_call_wrapups_call_id_key` (`call_id`),
  INDEX `voice_call_wrapups_business_disposition_idx` (`business_id`, `disposition`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_call_wrapups`
  ADD CONSTRAINT `voice_call_wrapups_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `voice_call_wrapups_call_id_fkey`
    FOREIGN KEY (`call_id`) REFERENCES `phone_calls` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
