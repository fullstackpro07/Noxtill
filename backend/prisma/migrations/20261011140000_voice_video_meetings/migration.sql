-- Meeting scheduling and hashed, expiring guest invite links only.
-- This migration intentionally creates no media sessions or recordings.
CREATE TABLE `voice_video_meetings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `duration_min` INTEGER NOT NULL,
    `time_zone` VARCHAR(100) NOT NULL,
    `status` ENUM('scheduled', 'cancelled', 'ended') NOT NULL DEFAULT 'scheduled',
    `host_business_user_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `appointment_id` VARCHAR(191) NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancellation_reason` VARCHAR(500) NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `voice_video_meeting_schedule_idx`(`business_id`, `status`, `scheduled_at`),
    INDEX `voice_video_meeting_host_idx`(`business_id`, `host_business_user_id`, `scheduled_at`),
    INDEX `voice_video_meeting_customer_idx`(`business_id`, `customer_id`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_meeting_invites` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `meeting_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `guest_name` VARCHAR(120) NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `voice_meeting_invites_token_hash_key`(`token_hash`),
    INDEX `voice_meeting_invite_meeting_idx`(`business_id`, `meeting_id`, `expires_at`),
    INDEX `voice_meeting_invite_guest_idx`(`business_id`, `email`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_video_meetings` ADD CONSTRAINT `voice_video_meetings_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_video_meetings` ADD CONSTRAINT `voice_video_meetings_host_business_user_id_fkey` FOREIGN KEY (`host_business_user_id`) REFERENCES `business_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_video_meetings` ADD CONSTRAINT `voice_video_meetings_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_video_meetings` ADD CONSTRAINT `voice_video_meetings_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `voice_meeting_invites` ADD CONSTRAINT `voice_meeting_invites_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `voice_meeting_invites` ADD CONSTRAINT `voice_meeting_invites_meeting_id_fkey` FOREIGN KEY (`meeting_id`) REFERENCES `voice_video_meetings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
