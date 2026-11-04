ALTER TABLE `procurement_requests`
  ADD COLUMN `source_agent_recommendation_id` VARCHAR(191) NULL,
  ADD COLUMN `agent_context` JSON NULL;

CREATE UNIQUE INDEX `procurement_requests_source_agent_recommendation_id_key`
  ON `procurement_requests` (`source_agent_recommendation_id`);

ALTER TABLE `procurement_requests`
  ADD CONSTRAINT `procurement_requests_source_agent_recommendation_id_fkey`
  FOREIGN KEY (`source_agent_recommendation_id`) REFERENCES `specialist_agent_recommendations` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
