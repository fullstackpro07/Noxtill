-- AlterTable
ALTER TABLE `import_batches`
  MODIFY `source` ENUM('csv', 'xlsx', 'text', 'docx', 'photo') NOT NULL,
  ADD COLUMN `scanner_type` VARCHAR(191) NULL,
  ADD COLUMN `image_key` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `digitizer_aliases` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `raw_text` VARCHAR(191) NOT NULL,
    `corrected_text` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digitizer_aliases_business_id_raw_text_key`(`business_id`, `raw_text`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `digitizer_aliases` ADD CONSTRAINT `digitizer_aliases_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
