CREATE TABLE `voice_human_agent_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `call_id` VARCHAR(191) NOT NULL,
    `staff_user_id` VARCHAR(191) NOT NULL,
    `profile_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'offered',
    `provider_status` VARCHAR(40) NULL,
    `connected` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `voice_human_agent_assignments_call_id_key` (`call_id`),
    INDEX `voice_agent_assignments_business_staff_status_idx` (`business_id`, `staff_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `voice_human_agent_assignments`
    ADD CONSTRAINT `voice_human_agent_assignments_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `voice_human_agent_assignments`
    ADD CONSTRAINT `voice_human_agent_assignments_call_id_fkey`
    FOREIGN KEY (`call_id`) REFERENCES `phone_calls`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `voice_human_agent_assignments`
    ADD CONSTRAINT `voice_human_agent_assignments_profile_id_fkey`
    FOREIGN KEY (`profile_id`) REFERENCES `voice_human_agent_profiles`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
