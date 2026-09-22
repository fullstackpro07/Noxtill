ALTER TABLE `ad_leads` ADD COLUMN `status` ENUM('new', 'contacted', 'converted') NOT NULL DEFAULT 'new';
