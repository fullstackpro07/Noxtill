ALTER TABLE `commerce_agent_tool_runs`
  ADD COLUMN `idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `idempotency_request_hash` CHAR(64) NULL,
  ADD COLUMN `result_resource_type` VARCHAR(48) NULL,
  ADD COLUMN `result_resource_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `commerce_agent_tool_runs_idempotency_uq` (
    `business_id`,
    `idempotency_key_hash`
  );
