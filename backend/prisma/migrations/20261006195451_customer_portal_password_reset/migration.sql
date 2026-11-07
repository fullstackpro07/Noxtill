CREATE TABLE `customer_portal_password_resets` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `customer_portal_password_resets_token_hash_key` (`token_hash`),
    INDEX `cp_password_resets_business_account_exp_idx` (`business_id`, `account_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_portal_password_resets`
    ADD CONSTRAINT `customer_portal_password_resets_business_id_fkey`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `customer_portal_password_resets`
    ADD CONSTRAINT `customer_portal_password_resets_account_id_fkey`
    FOREIGN KEY (`account_id`) REFERENCES `customer_portal_accounts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
