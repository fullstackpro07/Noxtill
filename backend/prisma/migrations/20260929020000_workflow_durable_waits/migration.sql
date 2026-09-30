ALTER TABLE `workflow_runs`
  MODIFY `status` ENUM('running', 'waiting', 'success', 'failed', 'skipped', 'cancelled') NOT NULL,
  ADD COLUMN `waiting_until` DATETIME(3) NULL,
  ADD COLUMN `next_action_index` INTEGER NULL,
  ADD INDEX `workflow_runs_waiting_due_idx` (`business_id`, `status`, `waiting_until`);

ALTER TABLE `workflow_run_attempts`
  MODIFY `status` ENUM('running', 'waiting', 'success', 'failed', 'skipped', 'cancelled') NOT NULL;
