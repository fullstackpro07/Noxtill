ALTER TABLE `ai_call_logs`
  ADD COLUMN `specialist_agent_run_id` VARCHAR(191) NULL;

CREATE INDEX `ai_call_logs_specialist_run_created_idx`
  ON `ai_call_logs` (`specialist_agent_run_id`, `created_at`);

ALTER TABLE `ai_call_logs`
  ADD CONSTRAINT `ai_call_logs_specialist_run_fkey`
  FOREIGN KEY (`specialist_agent_run_id`) REFERENCES `specialist_agent_runs` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
