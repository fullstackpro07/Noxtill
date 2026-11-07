ALTER TABLE `messages`
  ADD COLUMN `idempotency_key` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `messages_business_idempotency_key_key` (`business_id`, `idempotency_key`);

ALTER TABLE `workflow_runs`
  ADD COLUMN `retry_count` INTEGER NOT NULL DEFAULT 0;
