-- Delivery: link to the Message row of the last customer notice so "customer told" reflects real message status.
ALTER TABLE `deliveries` ADD COLUMN `notification_message_id` VARCHAR(191) NULL;
