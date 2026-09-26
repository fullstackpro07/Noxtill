-- Unified Inbox: conversations, messages, events, AI drafts, saved replies, rules, settings.
-- Hand-written from the inbox_* statements of a schema diff (the rest of that diff was the
-- known spurious index drop/re-add artifact, see docs/DATABASE.md).

CREATE TABLE `inbox_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `contact_handle` VARCHAR(191) NOT NULL,
    `contact_name` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'open',
    `assignee_user_id` VARCHAR(191) NULL,
    `starred` BOOLEAN NOT NULL DEFAULT false,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `tags` JSON NOT NULL,
    `snoozed_until` DATETIME(3) NULL,
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `last_message_at` DATETIME(3) NOT NULL,
    `last_message_preview` VARCHAR(280) NOT NULL DEFAULT '',
    `awaiting_reply_since` DATETIME(3) NULL,
    `first_inbound_at` DATETIME(3) NULL,
    `first_reply_at` DATETIME(3) NULL,
    `first_reply_minutes` INTEGER NULL,
    `flagged_at` DATETIME(3) NULL,
    `unassigned_notified_at` DATETIME(3) NULL,
    `away_sent_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inbox_conversations_business_id_status_last_message_at_idx`(`business_id`, `status`, `last_message_at`),
    INDEX `inbox_conversations_business_id_customer_id_idx`(`business_id`, `customer_id`),
    INDEX `inbox_conversations_business_id_assignee_user_id_idx`(`business_id`, `assignee_user_id`),
    UNIQUE INDEX `inbox_conversations_business_id_channel_contact_handle_key`(`business_id`, `channel`, `contact_handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_messages` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `body` TEXT NOT NULL,
    `author_user_id` VARCHAR(191) NULL,
    `author_name` VARCHAR(191) NULL,
    `external_key` VARCHAR(191) NULL,
    `social_inbox_item_id` VARCHAR(191) NULL,
    `message_id` VARCHAR(191) NULL,
    `source` VARCHAR(40) NULL,
    `send_error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inbox_messages_external_key_key`(`external_key`),
    UNIQUE INDEX `inbox_messages_social_inbox_item_id_key`(`social_inbox_item_id`),
    INDEX `inbox_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `inbox_messages_business_id_created_at_idx`(`business_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NULL,
    `kind` VARCHAR(40) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(191) NULL,
    `rule_id` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inbox_events_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `inbox_events_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `inbox_events_rule_id_created_at_idx`(`rule_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_ai_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `for_message_id` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `sources` JSON NOT NULL,
    `needs_decision` BOOLEAN NOT NULL DEFAULT false,
    `warning` VARCHAR(500) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `decided_by_user_id` VARCHAR(191) NULL,
    `decided_by_name` VARCHAR(191) NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inbox_ai_drafts_business_id_status_idx`(`business_id`, `status`),
    INDEX `inbox_ai_drafts_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_reply_folders` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inbox_reply_folders_business_id_name_key`(`business_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_saved_replies` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `folder` VARCHAR(40) NOT NULL,
    `slug` VARCHAR(40) NOT NULL,
    `body` TEXT NOT NULL,
    `use_count` INTEGER NOT NULL DEFAULT 0,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inbox_saved_replies_business_id_slug_key`(`business_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `trigger` VARCHAR(20) NOT NULL,
    `keywords` JSON NOT NULL,
    `minutes` INTEGER NULL,
    `tag` VARCHAR(40) NULL,
    `pin_to_top` BOOLEAN NOT NULL DEFAULT false,
    `assignee_user_id` VARCHAR(191) NULL,
    `flag` BOOLEAN NOT NULL DEFAULT false,
    `message` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `paused_at` DATETIME(3) NULL,
    `paused_by_name` VARCHAR(191) NULL,
    `run_count` INTEGER NOT NULL DEFAULT 0,
    `last_run_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inbox_rules_business_id_trigger_active_idx`(`business_id`, `trigger`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inbox_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `tone` VARCHAR(12) NOT NULL DEFAULT 'warm',
    `language` VARCHAR(12) NOT NULL DEFAULT 'match',
    `assign_mode` VARCHAR(12) NOT NULL DEFAULT 'none',
    `working_hours` JSON NULL,
    `ai_read_records` BOOLEAN NOT NULL DEFAULT true,
    `ai_auto_draft` BOOLEAN NOT NULL DEFAULT true,
    `ai_facts_only` BOOLEAN NOT NULL DEFAULT true,
    `ai_next_action` BOOLEAN NOT NULL DEFAULT true,
    `ai_summarise` BOOLEAN NOT NULL DEFAULT false,
    `notify_unassigned` BOOLEAN NOT NULL DEFAULT true,
    `notify_money` BOOLEAN NOT NULL DEFAULT true,
    `first_reply_target_min` INTEGER NOT NULL DEFAULT 15,
    `email_reply_target_min` INTEGER NOT NULL DEFAULT 240,
    `money_reply_target_min` INTEGER NOT NULL DEFAULT 30,
    `unassigned_target_min` INTEGER NOT NULL DEFAULT 10,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inbox_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inbox_messages` ADD CONSTRAINT `inbox_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `inbox_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inbox_ai_drafts` ADD CONSTRAINT `inbox_ai_drafts_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `inbox_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
