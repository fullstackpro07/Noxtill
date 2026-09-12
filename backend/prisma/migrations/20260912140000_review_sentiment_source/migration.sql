-- Private Reviews depth fix (UPD-INT-008): themes clustered from private-feedback messages are a
-- genuinely different corpus from public review text and must never share a row with (or be wiped
-- out by regenerating) the other. Existing rows are all real public-review themes already, so the
-- default backfills them correctly with no data loss.

-- AlterTable
ALTER TABLE `review_sentiment_themes`
  ADD COLUMN `source` ENUM('public_review', 'private_feedback') NOT NULL DEFAULT 'public_review';

-- CreateIndex (created before dropping the old one — MySQL won't drop an index still backing the business_id foreign key until a replacement index covering it exists)
CREATE INDEX `review_sentiment_themes_business_id_source_generated_at_idx` ON `review_sentiment_themes`(`business_id`, `source`, `generated_at`);

-- DropIndex
DROP INDEX `review_sentiment_themes_business_id_generated_at_idx` ON `review_sentiment_themes`;
