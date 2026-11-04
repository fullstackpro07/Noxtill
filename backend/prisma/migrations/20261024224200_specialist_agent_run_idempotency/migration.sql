ALTER TABLE `specialist_agent_runs`
  ADD COLUMN `idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `idempotency_request_hash` CHAR(64) NULL,
  ADD UNIQUE INDEX `specialist_agent_runs_idempotency_uq` (
    `business_id`,
    `agent_key`,
    `idempotency_key_hash`
  );
