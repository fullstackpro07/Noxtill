-- AlterTable
ALTER TABLE `reminder_rules` ADD COLUMN `custom_message` TEXT NULL;

-- AlterTable
ALTER TABLE `messages` ADD COLUMN `custom_body` TEXT NULL;
