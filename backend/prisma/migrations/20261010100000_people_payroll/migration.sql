-- AlterTable
ALTER TABLE `time_off` ADD COLUMN `attachment_key` VARCHAR(400) NULL,
    ADD COLUMN `days` DECIMAL(5, 1) NULL,
    ADD COLUMN `emergency` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `leave_type` VARCHAR(20) NULL,
    ADD COLUMN `number` VARCHAR(20) NULL,
    ADD COLUMN `partial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reject_reason` VARCHAR(500) NULL,
    ADD COLUMN `status` VARCHAR(12) NOT NULL DEFAULT 'Submitted';

-- CreateTable
CREATE TABLE `pp_settings` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `next_job` INTEGER NOT NULL DEFAULT 1,
    `next_cand` INTEGER NOT NULL DEFAULT 1,
    `next_int` INTEGER NOT NULL DEFAULT 1,
    `next_offer` INTEGER NOT NULL DEFAULT 1,
    `next_onb` INTEGER NOT NULL DEFAULT 1,
    `next_leave` INTEGER NOT NULL DEFAULT 1,
    `next_rule` INTEGER NOT NULL DEFAULT 1,
    `next_cycle` INTEGER NOT NULL DEFAULT 1,
    `next_review` INTEGER NOT NULL DEFAULT 1,
    `next_course` INTEGER NOT NULL DEFAULT 1,
    `next_ta` INTEGER NOT NULL DEFAULT 1,
    `next_ofb` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_settings_business_id_key`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_settings_versions` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `changed` JSON NOT NULL,
    `by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pp_settings_versions_business_id_version_key`(`business_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_employees` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `business_user_id` VARCHAR(191) NOT NULL,
    `department` VARCHAR(60) NULL,
    `title` VARCHAR(120) NULL,
    `employment_type` VARCHAR(20) NOT NULL DEFAULT 'Full-time',
    `manager_user_id` VARCHAR(191) NULL,
    `pay_basis` VARCHAR(20) NOT NULL DEFAULT 'Salaried',
    `monthly_salary` DECIMAL(14, 2) NULL,
    `start_date` DATE NULL,
    `probation_end` DATE NULL,
    `contract_end` DATE NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'Active',
    `in_payroll` BOOLEAN NOT NULL DEFAULT true,
    `bank_name` VARCHAR(80) NULL,
    `bank_account_enc` TEXT NULL,
    `bank_account_mask` VARCHAR(40) NULL,
    `bank_title` VARCHAR(120) NULL,
    `tax_status` VARCHAR(12) NULL,
    `tax_id_enc` TEXT NULL,
    `tax_id_mask` VARCHAR(40) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_employees_business_user_id_key`(`business_user_id`),
    INDEX `pp_employees_business_id_idx`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `department` VARCHAR(60) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `work_mode` VARCHAR(12) NOT NULL DEFAULT 'On-site',
    `employment_type` VARCHAR(20) NOT NULL DEFAULT 'Full-time',
    `target` INTEGER NOT NULL DEFAULT 1,
    `manager_user_id` VARCHAR(191) NULL,
    `recruiter_user_id` VARCHAR(191) NULL,
    `comp_min` DECIMAL(14, 2) NULL,
    `comp_max` DECIMAL(14, 2) NULL,
    `comp_public` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(255) NULL,
    `budget_ref` VARCHAR(80) NULL,
    `description` TEXT NULL,
    `target_days` INTEGER NOT NULL DEFAULT 30,
    `status` VARCHAR(20) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `opened_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_jobs_business_id_status_idx`(`business_id`, `status`),
    UNIQUE INDEX `pp_jobs_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_candidates` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `source` VARCHAR(40) NOT NULL,
    `referred_by` VARCHAR(160) NULL,
    `stage` VARCHAR(20) NOT NULL,
    `owner_user_id` VARCHAR(191) NULL,
    `expected_comp` DECIMAL(14, 2) NULL,
    `availability` VARCHAR(80) NULL,
    `consent` VARCHAR(10) NOT NULL,
    `resume_key` VARCHAR(400) NULL,
    `resume_name` VARCHAR(255) NULL,
    `reject_reason` VARCHAR(500) NULL,
    `hired_user_id` VARCHAR(191) NULL,
    `history` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_candidates_business_id_job_id_idx`(`business_id`, `job_id`),
    UNIQUE INDEX `pp_candidates_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_interviews` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `candidate_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `round` VARCHAR(40) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `duration_min` INTEGER NOT NULL DEFAULT 45,
    `timezone` VARCHAR(60) NOT NULL,
    `location` VARCHAR(160) NOT NULL,
    `interviewers` JSON NOT NULL,
    `status` VARCHAR(14) NOT NULL,
    `feedback_due` DATETIME(3) NULL,
    `scorecards` JSON NOT NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_interviews_business_id_candidate_id_idx`(`business_id`, `candidate_id`),
    UNIQUE INDEX `pp_interviews_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_offers` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `candidate_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `employment_type` VARCHAR(20) NOT NULL,
    `start_date` DATE NOT NULL,
    `comp` DECIMAL(14, 2) NOT NULL,
    `frequency` VARCHAR(10) NOT NULL,
    `probation` VARCHAR(20) NOT NULL,
    `benefits` VARCHAR(255) NULL,
    `conditions` VARCHAR(255) NULL,
    `expires_on` DATE NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `approved_comp` DECIMAL(14, 2) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `template_id` VARCHAR(191) NULL,
    `doc_id` VARCHAR(191) NULL,
    `sign_request_id` VARCHAR(191) NULL,
    `decline_reason` VARCHAR(500) NULL,
    `versions` JSON NOT NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_offers_business_id_candidate_id_idx`(`business_id`, `candidate_id`),
    UNIQUE INDEX `pp_offers_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_onboarding` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `candidate_id` VARCHAR(191) NULL,
    `start_date` DATE NOT NULL,
    `template` VARCHAR(80) NOT NULL,
    `manager_user_id` VARCHAR(191) NULL,
    `buddy_user_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL,
    `items` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_onboarding_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_rules` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `classification` VARCHAR(80) NOT NULL,
    `tax_treatment` VARCHAR(20) NOT NULL,
    `method` VARCHAR(24) NOT NULL,
    `eligibility` VARCHAR(120) NOT NULL,
    `finance_account` VARCHAR(80) NULL,
    `provider` VARCHAR(120) NULL,
    `versions` JSON NOT NULL,
    `assigned` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_rules_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_runs` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `pay_date` DATE NOT NULL,
    `status` VARCHAR(26) NOT NULL,
    `correction_of` VARCHAR(191) NULL,
    `prepared_by_id` VARCHAR(191) NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `snapshot` JSON NULL,
    `exceptions` JSON NOT NULL,
    `excluded` JSON NOT NULL,
    `journal_ref` VARCHAR(40) NULL,
    `batch_ref` VARCHAR(40) NULL,
    `history` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `finalized_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_runs_business_id_period_idx`(`business_id`, `period`),
    UNIQUE INDEX `pp_runs_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_run_lines` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `calc` JSON NOT NULL,
    `gross` DECIMAL(14, 2) NOT NULL,
    `net` DECIMAL(14, 2) NULL,
    `tax` DECIMAL(14, 2) NULL,
    `employer` DECIMAL(14, 2) NOT NULL,
    `payout` VARCHAR(10) NOT NULL DEFAULT 'Pending',
    `payout_ref` VARCHAR(80) NULL,
    `paid_at` DATETIME(3) NULL,
    `slip_status` VARCHAR(16) NULL,
    `slip_delivered_at` DATETIME(3) NULL,
    `slip_viewed_at` DATETIME(3) NULL,
    `slip_key` VARCHAR(400) NULL,

    UNIQUE INDEX `pp_run_lines_run_id_user_id_key`(`run_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_cycles` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `start_on` DATE NOT NULL,
    `end_on` DATE NOT NULL,
    `scale` INTEGER NOT NULL DEFAULT 4,
    `status` VARCHAR(10) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pp_cycles_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `cycle_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `reviewer_user_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `goals` JSON NOT NULL,
    `self_text` TEXT NULL,
    `manager_text` TEXT NULL,
    `rating` VARCHAR(20) NULL,
    `acknowledged` BOOLEAN NOT NULL DEFAULT false,
    `dev` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_reviews_business_id_number_key`(`business_id`, `number`),
    UNIQUE INDEX `pp_reviews_cycle_id_user_id_key`(`cycle_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_courses` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `provider` VARCHAR(120) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `roles` JSON NOT NULL,
    `hours` DECIMAL(6, 1) NOT NULL,
    `mode` VARCHAR(20) NOT NULL,
    `assessment` BOOLEAN NOT NULL DEFAULT false,
    `skill` VARCHAR(80) NOT NULL,
    `valid_days` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pp_courses_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_training` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `due_on` DATE NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `score` DECIMAL(5, 1) NULL,
    `cert_doc_id` VARCHAR(191) NULL,
    `cert_expires` DATE NULL,
    `completed_at` DATETIME(3) NULL,
    `verified_by_id` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `pp_training_business_id_user_id_idx`(`business_id`, `user_id`),
    UNIQUE INDEX `pp_training_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_offboarding` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `exit_type` VARCHAR(20) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `notice_date` DATE NOT NULL,
    `last_day` DATE NOT NULL,
    `handover_user_id` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL,
    `items` JSON NOT NULL,
    `final_run_id` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_offboarding_business_id_number_key`(`business_id`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_audit` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_name` VARCHAR(160) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity_type` VARCHAR(16) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `detail` TEXT NOT NULL,
    `correlation` VARCHAR(24) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pp_audit_business_id_created_at_idx`(`business_id`, `created_at`),
    INDEX `pp_audit_business_id_entity_id_idx`(`business_id`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pp_idem` (
    `id` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `result` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pp_idem_business_id_key_key`(`business_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pp_run_lines` ADD CONSTRAINT `pp_run_lines_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `pp_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing time-off rows get a status derived from the old approve/reject flags.
UPDATE `time_off` SET `status` = CASE WHEN `approved` = 1 THEN 'Approved' WHEN `reviewed_by_user_id` IS NOT NULL THEN 'Rejected' ELSE 'Submitted' END;
