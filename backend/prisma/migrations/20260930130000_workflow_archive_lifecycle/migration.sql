-- Keep retired workflows and their run/version history available for audit.
ALTER TABLE `workflows`
    ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD INDEX `workflows_business_id_archived_at_created_at_idx` (`business_id`, `archived_at`, `created_at`);
