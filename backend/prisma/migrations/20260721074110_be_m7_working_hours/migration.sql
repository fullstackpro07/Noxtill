-- BE-M7: weekly working hours per business, used to compute public booking slots.
ALTER TABLE "businesses" ADD COLUMN "working_hours" JSONB NOT NULL DEFAULT '{}';
