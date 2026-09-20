-- Help Assistant article drawer's "Steps" section needs real, ordered step content per article.
-- AlterTable
ALTER TABLE `help_articles` ADD COLUMN `steps` JSON NOT NULL DEFAULT (JSON_ARRAY());
