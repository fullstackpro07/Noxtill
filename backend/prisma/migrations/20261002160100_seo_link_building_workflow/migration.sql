-- Statement 1/4: persist the governed link-building pipeline on existing off-page prospects.
ALTER TABLE `seo_off_page_opportunities`
  ADD COLUMN `approval_requested_at` DATETIME(3) NULL,
  ADD COLUMN `approved_at` DATETIME(3) NULL,
  ADD COLUMN `approved_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `contact_email` VARCHAR(191) NULL,
  ADD COLUMN `contact_name` VARCHAR(191) NULL,
  ADD COLUMN `contact_source` VARCHAR(512) NULL,
  ADD COLUMN `outcome_reason` TEXT NULL,
  ADD COLUMN `outreach_angle` TEXT NULL,
  ADD COLUMN `outreach_draft` TEXT NULL,
  ADD COLUMN `owner_user_id` VARCHAR(191) NULL,
  ADD COLUMN `response_at` DATETIME(3) NULL,
  ADD COLUMN `response_note` TEXT NULL,
  ADD COLUMN `sent_at` DATETIME(3) NULL,
  ADD COLUMN `stage` VARCHAR(32) NOT NULL DEFAULT 'identified',
  ADD COLUMN `won_link_id` VARCHAR(191) NULL;

-- Statement 2/4: one verified backlink can complete only one opportunity.
CREATE UNIQUE INDEX `seo_off_page_opportunities_won_link_id_key`
  ON `seo_off_page_opportunities`(`won_link_id`);

-- Statement 3/4: pipeline screens query opportunities by business, pipeline and stage.
CREATE INDEX `seo_off_page_opps_business_pipeline_stage_idx`
  ON `seo_off_page_opportunities`(`business_id`, `pipeline`, `stage`);

-- Statement 4/4: retain referential integrity for merchant-verified wins.
ALTER TABLE `seo_off_page_opportunities`
  ADD CONSTRAINT `seo_off_page_opportunities_won_link_id_fkey`
  FOREIGN KEY (`won_link_id`) REFERENCES `seo_off_page_links`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
