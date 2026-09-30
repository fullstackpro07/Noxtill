ALTER TABLE `workflows`
  ADD COLUMN `condition_mode` ENUM('all', 'any') NOT NULL DEFAULT 'all';

ALTER TABLE `workflow_versions`
  ADD COLUMN `condition_mode` ENUM('all', 'any') NOT NULL DEFAULT 'all';
