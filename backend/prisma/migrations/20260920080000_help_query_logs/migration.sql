-- Real per-question log for the Help Assistant, unifying with Chat History alongside
-- AssistantConversation (Business) and VoiceCommandDraft (Voice).
-- CreateTable
CREATE TABLE `help_query_logs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `sources` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `help_query_logs_business_id_user_id_created_at_idx`(`business_id`, `user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
