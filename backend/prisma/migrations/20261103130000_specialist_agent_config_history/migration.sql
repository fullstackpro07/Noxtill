ALTER TABLE `specialist_agent_runs`
  ADD COLUMN `agent_config_version` INTEGER NULL,
  ADD INDEX `specialist_agent_runs_config_version_idx` (`business_id`, `agent_key`, `agent_config_version`);

CREATE TABLE `specialist_agent_config_versions` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `agent_key` VARCHAR(64) NOT NULL,
  `version` INTEGER NOT NULL,
  `config_hash` CHAR(64) NOT NULL,
  `configuration` JSON NOT NULL,
  `changed_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `specialist_agent_config_versions_business_agent_version_uq` (`business_id`, `agent_key`, `version`),
  INDEX `specialist_agent_config_versions_business_agent_created_idx` (`business_id`, `agent_key`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `specialist_agent_config_versions_business_fk`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
