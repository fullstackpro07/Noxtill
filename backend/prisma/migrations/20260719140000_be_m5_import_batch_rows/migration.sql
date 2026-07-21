-- BE-042/043/044: staged rows for the customer import preview/confirm pipeline.
ALTER TABLE "import_batches" ADD COLUMN "rows" JSONB NOT NULL DEFAULT '[]';
