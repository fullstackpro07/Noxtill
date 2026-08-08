-- DropForeignKey
ALTER TABLE "competitor_snapshots" DROP CONSTRAINT "competitor_snapshots_competitor_id_fkey";

-- DropForeignKey
ALTER TABLE "keyword_rank_snapshots" DROP CONSTRAINT "keyword_rank_snapshots_keyword_id_fkey";

-- AddForeignKey
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_rank_snapshots" ADD CONSTRAINT "keyword_rank_snapshots_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "tracked_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
