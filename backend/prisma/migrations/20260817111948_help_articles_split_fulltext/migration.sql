-- Split the composite FULLTEXT(title, body) index into two separate single-column FULLTEXT
-- indexes, so help.service.ts's retrieveHelpPassages() can score MATCH(title)/MATCH(body)
-- independently and weight title matches 2x over body matches.
ALTER TABLE `help_articles` DROP INDEX `help_articles_title_body_idx`;
ALTER TABLE `help_articles` ADD FULLTEXT INDEX `help_articles_title_idx` (`title`);
ALTER TABLE `help_articles` ADD FULLTEXT INDEX `help_articles_body_idx` (`body`);
