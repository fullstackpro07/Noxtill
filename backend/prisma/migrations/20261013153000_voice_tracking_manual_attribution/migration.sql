-- Evidence-backed merchant corrections for call source attribution.
-- Automatic click/session/campaign attribution remains unsupported.
ALTER TABLE `phone_calls`
  ADD COLUMN `attribution_source` VARCHAR(191) NULL,
  ADD COLUMN `attribution_channel` VARCHAR(191) NULL,
  ADD COLUMN `attribution_campaign_id` VARCHAR(191) NULL,
  ADD COLUMN `attribution_evidence` TEXT NULL,
  ADD COLUMN `attribution_reason` TEXT NULL,
  ADD COLUMN `attribution_updated_at` DATETIME(3) NULL,
  ADD INDEX `phone_calls_business_attribution_idx` (`business_id`, `attribution_source`, `started_at`),
  ADD CONSTRAINT `phone_calls_attribution_campaign_id_fkey`
    FOREIGN KEY (`attribution_campaign_id`) REFERENCES `ad_campaigns` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
