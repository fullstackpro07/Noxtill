-- CreateEnum
CREATE TYPE "AiInsightCategory" AS ENUM ('sales', 'stock', 'customers', 'marketing', 'credit');

-- CreateEnum
CREATE TYPE "AiInsightStatus" AS ENUM ('new', 'actioned', 'dismissed');

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "category" "AiInsightCategory" NOT NULL,
    "observation" TEXT NOT NULL,
    "source_figure" TEXT NOT NULL,
    "status" "AiInsightStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_insights_business_id_status_created_at_idx" ON "ai_insights"("business_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
