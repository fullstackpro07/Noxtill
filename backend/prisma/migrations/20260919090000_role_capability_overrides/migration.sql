-- Staff module v2 — Roles & Permissions: real per-business overrides of the Manager/Staff
-- system-role capability sets (Owner is never overridden here).
-- CreateTable
CREATE TABLE `role_capability_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `role` ENUM('owner', 'manager', 'staff') NOT NULL,
    `capabilities` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `role_capability_overrides_business_id_role_key`(`business_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_capability_overrides` ADD CONSTRAINT `role_capability_overrides_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
