ALTER TABLE `workflows`
  ADD COLUMN `schedule_cron_expression` VARCHAR(100) NULL,
  ADD COLUMN `schedule_timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC';

ALTER TABLE `workflow_versions`
  ADD COLUMN `schedule_cron_expression` VARCHAR(100) NULL,
  ADD COLUMN `schedule_timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC';
