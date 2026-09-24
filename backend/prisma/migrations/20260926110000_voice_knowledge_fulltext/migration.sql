-- AI Phone, full: fulltext search over knowledge entries, mirroring HelpArticle's two-separate-
-- single-column-index pattern (see help_articles) so title/content can be scored independently.
ALTER TABLE `voice_knowledge_entries` ADD FULLTEXT INDEX `voice_knowledge_entries_title_idx`(`title`);
ALTER TABLE `voice_knowledge_entries` ADD FULLTEXT INDEX `voice_knowledge_entries_content_idx`(`content`);
