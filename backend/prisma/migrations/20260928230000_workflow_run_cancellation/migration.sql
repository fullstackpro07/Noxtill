ALTER TABLE `workflow_runs`
  MODIFY COLUMN `status` ENUM('running', 'success', 'failed', 'skipped', 'cancelled') NOT NULL;

ALTER TABLE `workflow_run_attempts`
  MODIFY COLUMN `status` ENUM('running', 'success', 'failed', 'skipped', 'cancelled') NOT NULL;
