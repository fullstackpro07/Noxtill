-- CreateEnum
CREATE TYPE "StaffShiftStatus" AS ENUM ('scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ShiftSwapStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "StaffAdvanceStatus" AS ENUM ('outstanding', 'deducted', 'cancelled');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "overtime_threshold_hours_per_week" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "StaffShiftStatus" NOT NULL DEFAULT 'scheduled',
    "note" TEXT,
    "swap_status" "ShiftSwapStatus",
    "swap_requested_by_user_id" TEXT,
    "swap_covering_user_id" TEXT,
    "swap_reason" TEXT,
    "swap_reviewed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_approvals" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_advances" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "status" "StaffAdvanceStatus" NOT NULL DEFAULT 'outstanding',
    "deducted_in_month" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_shifts_business_id_staff_user_id_starts_at_idx" ON "staff_shifts"("business_id", "staff_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "time_off_business_id_staff_user_id_idx" ON "time_off"("business_id", "staff_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_approvals_business_id_staff_user_id_month_key" ON "timesheet_approvals"("business_id", "staff_user_id", "month");

-- CreateIndex
CREATE INDEX "staff_advances_business_id_staff_user_id_status_idx" ON "staff_advances"("business_id", "staff_user_id", "status");

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
