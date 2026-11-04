CREATE TABLE `specialist_agent_run_events` (
  `id` VARCHAR(191) NOT NULL,
  `dedupe_key` CHAR(64) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `run_id` VARCHAR(191) NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `source_module` VARCHAR(16) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `entity_version` VARCHAR(64) NULL,
  `schema_version` INTEGER NOT NULL DEFAULT 1,
  `correlation_id` VARCHAR(191) NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `payload` JSON NOT NULL,
  INDEX `specialist_agent_run_events_business_run_time_idx` (`business_id`, `run_id`, `occurred_at`),
  INDEX `specialist_agent_run_events_business_name_time_idx` (`business_id`, `event_name`, `occurred_at`),
  UNIQUE INDEX `specialist_agent_run_events_dedupe_uq` (`dedupe_key`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_run_events_run_fk`
    FOREIGN KEY (`run_id`) REFERENCES `specialist_agent_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
