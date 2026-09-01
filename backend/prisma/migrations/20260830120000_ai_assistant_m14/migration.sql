ALTER TABLE `businesses`
  ADD COLUMN `ai_feature_toggles` JSON NOT NULL DEFAULT ('{}');

CREATE TABLE `voice_command_drafts` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `transcript` TEXT NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `args` JSON NOT NULL,
  `human_summary` TEXT NOT NULL,
  `status` ENUM('pending', 'confirmed', 'rejected') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `confirmed_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `voice_command_drafts_business_id_status_idx`(`business_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `assistant_conversations` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `assistant_conversations_business_id_user_id_updated_at_idx`(`business_id`, `user_id`, `updated_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `assistant_messages` (
  `id` VARCHAR(191) NOT NULL,
  `conversation_id` VARCHAR(191) NOT NULL,
  `role` ENUM('user', 'assistant') NOT NULL,
  `content` TEXT NOT NULL,
  `tool_calls` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `assistant_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_command_drafts`
  ADD CONSTRAINT `voice_command_drafts_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `assistant_conversations`
  ADD CONSTRAINT `assistant_conversations_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `assistant_conversations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `assistant_messages`
  ADD CONSTRAINT `assistant_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
