CREATE TABLE `workflow_variables` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `scope` ENUM('business', 'workflow', 'branch') NOT NULL,
    `scope_key` VARCHAR(191) NOT NULL,
    `environment` ENUM('draft', 'staging', 'production') NOT NULL DEFAULT 'production',
    `name` VARCHAR(100) NOT NULL,
    `value_type` ENUM('string', 'number', 'boolean', 'json', 'secret_reference') NOT NULL,
    `value` JSON NULL,
    `secret_reference` VARCHAR(191) NULL,
    `description` VARCHAR(500) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `updated_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `workflow_variables_namespace_name_key` (`business_id`, `environment`, `scope`, `scope_key`, `name`),
    INDEX `workflow_variables_business_environment_scope_idx` (`business_id`, `environment`, `scope`),
    INDEX `workflow_variables_business_created_idx` (`business_id`, `created_at`),
    CONSTRAINT `workflow_variables_business_id_fkey`
        FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
