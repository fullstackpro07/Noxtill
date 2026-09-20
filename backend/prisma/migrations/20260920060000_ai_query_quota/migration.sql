-- AI Settings query allowance: real, owner-configurable monthly cap on AI queries.
-- AlterTable
ALTER TABLE `businesses` ADD COLUMN `ai_query_quota` INTEGER NOT NULL DEFAULT 500;
