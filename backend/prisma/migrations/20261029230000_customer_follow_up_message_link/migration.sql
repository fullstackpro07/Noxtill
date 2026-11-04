ALTER TABLE `message_drafts`
  ADD COLUMN `customer_follow_up_task_id` VARCHAR(191) NULL;

CREATE INDEX `message_drafts_business_follow_up_task_idx`
  ON `message_drafts` (`business_id`, `customer_follow_up_task_id`);

ALTER TABLE `message_drafts`
  ADD CONSTRAINT `message_drafts_customer_follow_up_task_id_fkey`
  FOREIGN KEY (`customer_follow_up_task_id`) REFERENCES `customer_follow_up_tasks` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
