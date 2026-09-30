-- Persist authored workflow graphs and the selected branch used by each run.
ALTER TABLE `workflows`
    ADD COLUMN `graph` JSON NULL;

ALTER TABLE `workflow_versions`
    ADD COLUMN `graph` JSON NULL;

ALTER TABLE `workflow_runs`
    ADD COLUMN `execution_plan` JSON NULL,
    ADD COLUMN `next_plan_position` INT NULL;
