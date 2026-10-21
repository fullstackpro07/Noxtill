-- Approved voice usage drafts can be handed to Stripe once as a pending invoice item.
ALTER TABLE `voice_billing_drafts`
  ADD COLUMN `posted_at` DATETIME(3) NULL,
  ADD COLUMN `posted_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `provider_invoice_item_id` VARCHAR(64) NULL,
  ADD COLUMN `post_error` VARCHAR(300) NULL;
