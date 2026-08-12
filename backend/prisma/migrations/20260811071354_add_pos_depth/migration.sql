-- CreateEnum
CREATE TYPE "CashShiftStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('opening', 'sale', 'refund', 'cash_in', 'cash_out');

-- CreateTable
CREATE TABLE "held_sales" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "cart" JSONB NOT NULL,
    "held_by_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "opened_by_user_id" TEXT,
    "opening_float" DECIMAL(12,2) NOT NULL,
    "status" "CashShiftStatus" NOT NULL DEFAULT 'open',
    "counted_cash" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "variance_note" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_sale_drafts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "parsedCart" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_sale_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "held_sales_business_id_created_at_idx" ON "held_sales"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_shifts_business_id_status_idx" ON "cash_shifts"("business_id", "status");

-- CreateIndex
CREATE INDEX "cash_movements_business_id_shift_id_idx" ON "cash_movements"("business_id", "shift_id");

-- CreateIndex
CREATE INDEX "voice_sale_drafts_business_id_created_at_idx" ON "voice_sale_drafts"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "held_sales" ADD CONSTRAINT "held_sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_sale_drafts" ADD CONSTRAINT "voice_sale_drafts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
