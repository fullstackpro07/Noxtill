-- INT-005: expenses need a per-line description (category alone can't tell two "Utilities" rows apart).
ALTER TABLE "expenses" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "expenses" ALTER COLUMN "description" DROP DEFAULT;
