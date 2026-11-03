ALTER TABLE `email_events` MODIFY `type` ENUM('sent', 'delivered', 'open', 'click', 'unsub', 'bounce') NOT NULL;

ALTER TABLE `email_events` ADD COLUMN `provider_ref` VARCHAR(191) NULL;

CREATE INDEX `email_events_provider_ref_idx` ON `email_events`(`provider_ref`);
