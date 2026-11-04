ALTER TABLE `stock_transfers`
  ADD COLUMN `source_specialist_agent_recommendation_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `stock_transfer_agent_rec_uq` (`source_specialist_agent_recommendation_id`),
  ADD CONSTRAINT `stock_transfer_agent_rec_fk`
    FOREIGN KEY (`source_specialist_agent_recommendation_id`)
    REFERENCES `specialist_agent_recommendations` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
