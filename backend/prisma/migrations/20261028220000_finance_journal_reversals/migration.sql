ALTER TABLE `finance_journal_entries`
  ADD COLUMN `reversal_of_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `finance_journals_reversal_business_uq` (`reversal_of_id`, `business_id`),
  ADD CONSTRAINT `finance_journals_reversal_fk`
    FOREIGN KEY (`reversal_of_id`, `business_id`)
    REFERENCES `finance_journal_entries` (`id`, `business_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
