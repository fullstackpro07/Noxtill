ALTER TABLE `segments`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `source_agent_recommendation_id` VARCHAR(191) NULL,
  ADD COLUMN `agent_approved_version` INTEGER NULL,
  ADD COLUMN `agent_approved_definition_hash` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `segments_source_agent_recommendation_id_key` ON `segments`(`source_agent_recommendation_id`);

ALTER TABLE `segments` ADD CONSTRAINT `segments_source_agent_recommendation_id_fkey`
  FOREIGN KEY (`source_agent_recommendation_id`) REFERENCES `specialist_agent_recommendations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request', 'customer_segment') NOT NULL;
