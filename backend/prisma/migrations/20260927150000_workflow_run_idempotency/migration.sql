ALTER TABLE `workflow_runs`
  ADD COLUMN `trigger_event_id` VARCHAR(191) NULL,
  MODIFY COLUMN `status` ENUM('running', 'success', 'failed', 'skipped') NOT NULL,
  ADD UNIQUE INDEX `workflow_runs_business_workflow_event_key` (`business_id`, `workflow_id`, `trigger_event_id`);
