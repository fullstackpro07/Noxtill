-- AI Photo Digitizer, document workspace: every field the Digitizer screens show about a scanned
-- document is stored on its ImportBatch row (photo source only; all NULL for csv/xlsx/text/docx).
ALTER TABLE `import_batches`
    ADD COLUMN `original_name` VARCHAR(255) NULL,
    ADD COLUMN `mime_type` VARCHAR(100) NULL,
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `page_count` INTEGER NULL,
    ADD COLUMN `uploaded_by_id` VARCHAR(191) NULL,
    ADD COLUMN `group_id` VARCHAR(191) NULL,
    ADD COLUMN `stage` VARCHAR(32) NULL,
    ADD COLUMN `stage_started_at` DATETIME(3) NULL,
    ADD COLUMN `failure_reason` VARCHAR(500) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `approved_at` DATETIME(3) NULL,
    ADD COLUMN `approved_by_id` VARCHAR(191) NULL,
    ADD COLUMN `analysis` JSON NULL,
    ADD COLUMN `import_result` JSON NULL,
    ADD COLUMN `events` JSON NULL,
    ADD COLUMN `versions` JSON NULL;

CREATE INDEX `import_batches_business_id_source_created_at_idx` ON `import_batches`(`business_id`, `source`, `created_at`);
CREATE INDEX `import_batches_business_id_group_id_idx` ON `import_batches`(`business_id`, `group_id`);
