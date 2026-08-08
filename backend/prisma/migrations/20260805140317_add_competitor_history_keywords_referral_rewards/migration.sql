-- DropIndex
DROP INDEX "help_articles_body_trgm_idx";

-- DropIndex
DROP INDEX "help_articles_title_trgm_idx";

-- DropIndex
DROP INDEX "products_name_trgm_idx";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "referral_rewarded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "competitor_snapshots" (
    "id" TEXT NOT NULL,
    "competitor_id" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,
    "reviews_count" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_keywords" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_rank_snapshots" (
    "id" TEXT NOT NULL,
    "keyword_id" TEXT NOT NULL,
    "rank" INTEGER,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_rank_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitor_snapshots_competitor_id_captured_at_idx" ON "competitor_snapshots"("competitor_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_keywords_business_id_keyword_key" ON "tracked_keywords"("business_id", "keyword");

-- CreateIndex
CREATE INDEX "keyword_rank_snapshots_keyword_id_captured_at_idx" ON "keyword_rank_snapshots"("keyword_id", "captured_at");

-- AddForeignKey
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_rank_snapshots" ADD CONSTRAINT "keyword_rank_snapshots_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "tracked_keywords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "orders_business_id_orderNo_key" RENAME TO "orders_business_id_order_no_key";
