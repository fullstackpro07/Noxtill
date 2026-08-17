-- CreateEnum
CREATE TYPE "ActionItemType" AS ENUM ('complaint', 'low_stock', 'overdue_credit', 'unreplied_review');

-- CreateEnum
CREATE TYPE "ActionItemPriority" AS ENUM ('urgent', 'normal', 'low');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('completed', 'dismissed', 'snoozed');

-- CreateTable
CREATE TABLE "action_item_states" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "type" "ActionItemType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" "ActionItemStatus" NOT NULL,
    "snoozed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_item_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "action_item_states_business_id_type_entity_id_key" ON "action_item_states"("business_id", "type", "entity_id");

-- AddForeignKey
ALTER TABLE "action_item_states" ADD CONSTRAINT "action_item_states_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
