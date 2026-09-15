-- Orders module redesign: a real cancellation reason (previously nowhere to store one), and a
-- real quotation lifecycle (sent/accepted/declined/expired) independent of the order fulfilment
-- `status` enum, so the new Quotations screen's KPIs/status column are backed by real data instead
-- of the design's demo placeholders.

-- AlterTable
ALTER TABLE `orders`
    ADD COLUMN `cancel_reason` VARCHAR(191) NULL,
    ADD COLUMN `quotation_status` ENUM('draft', 'sent', 'accepted', 'declined', 'expired') NULL,
    ADD COLUMN `quotation_valid_until` DATETIME(3) NULL,
    ADD COLUMN `quotation_sent_at` DATETIME(3) NULL,
    ADD COLUMN `quotation_terms` TEXT NULL,
    ADD COLUMN `decline_reason` VARCHAR(191) NULL;
