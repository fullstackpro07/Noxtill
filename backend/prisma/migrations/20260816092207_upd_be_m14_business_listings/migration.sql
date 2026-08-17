-- CreateEnum
CREATE TYPE "GmbPostStatus" AS ENUM ('draft', 'published', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'bing_places';
ALTER TYPE "IntegrationProvider" ADD VALUE 'apple_business_connect';
ALTER TYPE "IntegrationProvider" ADD VALUE 'yelp';

-- AlterTable
ALTER TABLE "gmb_posts" ADD COLUMN     "status" "GmbPostStatus" NOT NULL DEFAULT 'draft';

-- CreateTable
CREATE TABLE "master_listings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "categories" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "hours" JSONB NOT NULL DEFAULT '{}',
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_sync_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmb_photos" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmb_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmb_qnas" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "external_id" TEXT,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmb_qnas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmb_insights_snapshots" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "direction_requests" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmb_insights_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_listings_business_id_key" ON "master_listings"("business_id");

-- CreateIndex
CREATE INDEX "listing_sync_logs_business_id_provider_created_at_idx" ON "listing_sync_logs"("business_id", "provider", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "citations_business_id_provider_key" ON "citations"("business_id", "provider");

-- CreateIndex
CREATE INDEX "gmb_photos_business_id_idx" ON "gmb_photos"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmb_qnas_external_id_key" ON "gmb_qnas"("external_id");

-- CreateIndex
CREATE INDEX "gmb_qnas_business_id_idx" ON "gmb_qnas"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmb_insights_snapshots_business_id_date_key" ON "gmb_insights_snapshots"("business_id", "date");

-- AddForeignKey
ALTER TABLE "master_listings" ADD CONSTRAINT "master_listings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_sync_logs" ADD CONSTRAINT "listing_sync_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmb_photos" ADD CONSTRAINT "gmb_photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmb_qnas" ADD CONSTRAINT "gmb_qnas_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmb_insights_snapshots" ADD CONSTRAINT "gmb_insights_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
