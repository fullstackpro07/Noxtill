ALTER TABLE `action_item_states`
MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request') NOT NULL;
