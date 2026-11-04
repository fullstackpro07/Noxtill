ALTER TABLE `customer_follow_up_tasks`
  ADD COLUMN `completion_outcome` VARCHAR(40) NULL,
  ADD INDEX `customer_follow_up_tasks_business_completed_idx` (`business_id`, `status`, `completed_at`);
