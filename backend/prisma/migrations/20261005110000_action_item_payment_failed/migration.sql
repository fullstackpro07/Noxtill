-- AlterTable
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'finance_approval', 'payment_approval', 'payment_dispute_due', 'payment_failed') NOT NULL;
