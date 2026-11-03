CREATE TABLE `voice_human_agent_profiles` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `staff_user_id` VARCHAR(191) NOT NULL,
  `skill_tags` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `languages` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `max_concurrent_calls` INTEGER NOT NULL DEFAULT 1,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `presence_status` ENUM('offline', 'available', 'busy', 'away') NOT NULL DEFAULT 'offline',
  `last_heartbeat_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `voice_human_agent_profiles_staff_user_id_key`(`staff_user_id`),
  UNIQUE INDEX `voice_human_agent_business_staff_key`(`business_id`, `staff_user_id`),
  INDEX `voice_human_agent_business_active_idx`(`business_id`, `active`),
  INDEX `voice_human_agent_presence_idx`(`business_id`, `presence_status`, `last_heartbeat_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_human_agent_profiles`
  ADD CONSTRAINT `voice_human_agent_profiles_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_human_agent_profiles`
  ADD CONSTRAINT `voice_human_agent_profiles_staff_user_id_fkey`
  FOREIGN KEY (`staff_user_id`) REFERENCES `business_users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
