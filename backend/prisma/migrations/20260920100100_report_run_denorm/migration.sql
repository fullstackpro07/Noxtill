-- Report run list views need validation status, exclusions and the summary without loading the
-- full snapshot JSON (a sales snapshot can hold hundreds of table rows).
-- AlterTable
ALTER TABLE `report_runs`
  ADD COLUMN `validation_status` VARCHAR(191) NULL,
  ADD COLUMN `exclusions_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `summary` TEXT NULL;
