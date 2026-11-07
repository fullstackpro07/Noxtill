-- Intentionally a no-op since the module21-contact-center -> main merge (2026-11-03).
--
-- On the Module 21 branch, the next migration (20260917120000_customer_settings_and_export_history)
-- was a shortened copy, and this file recreated its missing first stage for fresh databases. Main
-- restored the full 20260917120000 migration instead (commit d7b4be69), so running both on a fresh
-- install fails with "Duplicate column name 'status'". The file is kept, not deleted, so databases
-- that already recorded it as applied still match the migration history.
SELECT 1;
