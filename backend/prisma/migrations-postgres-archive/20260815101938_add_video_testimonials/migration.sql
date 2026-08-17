-- CreateEnum
CREATE TYPE "VideoTestimonialStatus" AS ENUM ('requested', 'submitted', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "video_testimonials" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "token" TEXT NOT NULL,
    "status" "VideoTestimonialStatus" NOT NULL DEFAULT 'requested',
    "video_key" TEXT,
    "caption" TEXT,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_testimonials_token_key" ON "video_testimonials"("token");

-- CreateIndex
CREATE INDEX "video_testimonials_business_id_status_idx" ON "video_testimonials"("business_id", "status");

-- AddForeignKey
ALTER TABLE "video_testimonials" ADD CONSTRAINT "video_testimonials_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_testimonials" ADD CONSTRAINT "video_testimonials_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
