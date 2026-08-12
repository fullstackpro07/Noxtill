-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('sale', 'booking', 'review', 'payment', 'complaint', 'stock');

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "entity_type" TEXT,
    "entity_id" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_business_id_created_at_idx" ON "activity_events"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
