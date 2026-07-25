-- BE-M11: product-analytics instrumentation (BE-072), not tenant-scoped.
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_name_created_at_idx" ON "events"("name", "created_at");
CREATE INDEX "events_business_id_idx" ON "events"("business_id");
