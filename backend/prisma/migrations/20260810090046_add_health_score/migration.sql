-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "health_score_weights" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "health_score_snapshots" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "rating_trend_score" DECIMAL(5,2) NOT NULL,
    "repeat_customer_score" DECIMAL(5,2) NOT NULL,
    "margin_score" DECIMAL(5,2) NOT NULL,
    "credit_recovery_score" DECIMAL(5,2) NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_score_snapshots_business_id_captured_at_idx" ON "health_score_snapshots"("business_id", "captured_at");

-- AddForeignKey
ALTER TABLE "health_score_snapshots" ADD CONSTRAINT "health_score_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
