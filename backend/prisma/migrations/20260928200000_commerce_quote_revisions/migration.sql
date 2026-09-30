ALTER TABLE `commerce_supplier_quotes`
  DROP INDEX `commerce_supplier_quotes_invitation_id_key`,
  ADD COLUMN `revision_no` INTEGER NOT NULL DEFAULT 1 AFTER `status`,
  ADD UNIQUE INDEX `commerce_supplier_quotes_invitation_id_revision_no_key` (`invitation_id`, `revision_no`),
  MODIFY `status` ENUM('submitted', 'shortlisted', 'superseded', 'awarded', 'rejected', 'withdrawn') NOT NULL DEFAULT 'submitted';
