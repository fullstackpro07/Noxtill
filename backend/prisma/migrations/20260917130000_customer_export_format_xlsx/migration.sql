-- Rename the "excel" export-format enum member to "xlsx" to match the app-wide ExportFormat
-- vocabulary already used by src/exports (xlsx/csv/pdf) — no rows exist yet, so this is a plain
-- enum-shape fix, not a data migration.

-- AlterTable
ALTER TABLE `customer_export_logs`
    MODIFY COLUMN `format` ENUM('csv', 'xlsx', 'pdf') NOT NULL DEFAULT 'csv';
