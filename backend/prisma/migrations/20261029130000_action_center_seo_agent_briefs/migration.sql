ALTER TABLE `action_item_states`
  MODIFY `type` ENUM('complaint', 'low_stock', 'overdue_credit', 'unreplied_review', 'commerce', 'procurement_request', 'customer_segment', 'customer_follow_up', 'inventory_transfer_approval', 'finance_journal', 'seo_content_brief') NOT NULL;
