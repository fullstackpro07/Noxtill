ALTER TABLE `voice_video_meetings` ADD COLUMN `end_requested_at` DATETIME(3) NULL,
    ADD COLUMN `provider_event_at` DATETIME(3) NULL,
    ADD COLUMN `room_state` VARCHAR(30) NOT NULL DEFAULT 'not_started';

CREATE TABLE `voice_meeting_participants` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `meeting_id` VARCHAR(191) NOT NULL,
    `invite_id` VARCHAR(191) NULL,
    `identity` VARCHAR(191) NOT NULL,
    `role` VARCHAR(10) NOT NULL,
    `admission` VARCHAR(20) NOT NULL DEFAULT 'waiting',
    `admitted_at` DATETIME(3) NULL,
    `decided_by_user_id` VARCHAR(191) NULL,
    `decision_reason` VARCHAR(500) NULL,
    `provider_sid` VARCHAR(191) NULL,
    `provider_joined_at` DATETIME(3) NULL,
    `provider_left_at` DATETIME(3) NULL,
    `provider_event_at` DATETIME(3) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `voice_meeting_participants_invite_id_key`(`invite_id`),
    INDEX `voice_meeting_participant_lobby_idx`(`business_id`, `meeting_id`, `admission`, `requested_at`),
    UNIQUE INDEX `voice_meeting_participants_meeting_id_identity_key`(`meeting_id`, `identity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_meeting_participants` ADD CONSTRAINT `voice_meeting_participants_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_meeting_participants` ADD CONSTRAINT `voice_meeting_participants_meeting_id_fkey` FOREIGN KEY (`meeting_id`) REFERENCES `voice_video_meetings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `voice_meeting_participants` ADD CONSTRAINT `voice_meeting_participants_invite_id_fkey` FOREIGN KEY (`invite_id`) REFERENCES `voice_meeting_invites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
