-- Action Center: Autonomous Commerce items.
ALTER TABLE `action_item_states` MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce') NOT NULL;
