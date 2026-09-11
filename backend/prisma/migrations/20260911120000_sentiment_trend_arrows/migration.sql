-- Trend-arrows depth fix: a real previous-run review count per theme (matched by normalized
-- theme text at generation time), so the frontend can show a genuine up/down/flat trend instead
-- of a fabricated one. Null when the theme is new this run.

-- AlterTable
ALTER TABLE `review_sentiment_themes` ADD COLUMN `previous_review_count` INTEGER NULL;
