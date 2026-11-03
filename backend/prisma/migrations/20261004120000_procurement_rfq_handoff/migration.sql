ALTER TABLE `procurement_requests`
MODIFY `status` ENUM('draft', 'submitted', 'approved', 'sourcing', 'rejected', 'converted', 'cancelled') NOT NULL DEFAULT 'draft';

ALTER TABLE `procurement_request_events`
MODIFY `event_type` ENUM('created', 'updated', 'submitted', 'approved', 'rejected', 'sourcing_started', 'sourcing_closed', 'cancelled', 'converted') NOT NULL,
MODIFY `from_status` ENUM('draft', 'submitted', 'approved', 'sourcing', 'rejected', 'converted', 'cancelled') NULL,
MODIFY `to_status` ENUM('draft', 'submitted', 'approved', 'sourcing', 'rejected', 'converted', 'cancelled') NULL;

ALTER TABLE `commerce_rfqs`
ADD COLUMN `source_procurement_request_id` VARCHAR(191) NULL,
ADD INDEX `commerce_rfqs_source_procurement_request_id_idx` (`source_procurement_request_id`),
ADD CONSTRAINT `commerce_rfqs_source_procurement_request_id_fkey`
  FOREIGN KEY (`source_procurement_request_id`) REFERENCES `procurement_requests`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
