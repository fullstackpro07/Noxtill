-- BE-M12: shared AI infra guardrails + call log + RAG help articles.
ALTER TABLE "businesses" ADD COLUMN "ai_monthly_cost_cap_usd" DECIMAL(8,2) NOT NULL DEFAULT 5.00;
ALTER TABLE "businesses" ADD COLUMN "ai_rate_limit_per_minute" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE "ai_call_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "kind" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_usd" DECIMAL(10,4) NOT NULL,
    "tool_calls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_call_logs_business_id_created_at_idx" ON "ai_call_logs"("business_id", "created_at");

CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");
CREATE INDEX IF NOT EXISTS help_articles_title_trgm_idx ON "help_articles" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS help_articles_body_trgm_idx ON "help_articles" USING gin ("body" gin_trgm_ops);
