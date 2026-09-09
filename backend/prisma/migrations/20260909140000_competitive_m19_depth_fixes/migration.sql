-- Keyword Rankings depth fix: real "top result" (captured from the same SerpApi rank-check call)
-- and real "search interest" (Google Trends via SerpApi) per snapshot. No schema change needed for
-- the competitor detail (hours/reviews/photos) fix or the SEO Heatmap real-map fix — both are
-- served fresh on demand, nothing new to persist there.

-- AlterTable
ALTER TABLE `keyword_rank_snapshots` ADD COLUMN `top_result_title` VARCHAR(191) NULL;
ALTER TABLE `keyword_rank_snapshots` ADD COLUMN `search_interest` INTEGER NULL;
