-- New CRM profiles are not marketing-consented unless explicitly opted in.
-- Preserve all existing values; do not infer or rewrite historical consent.
ALTER TABLE `customers` ALTER COLUMN `consent_marketing` SET DEFAULT 0;
