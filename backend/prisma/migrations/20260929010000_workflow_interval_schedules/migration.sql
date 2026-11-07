ALTER TABLE `workflows`
  MODIFY `trigger_key` ENUM(
    'sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review',
    'credit_overdue', 'birthday', 'payment_received', 'complaint_received',
    'stock_changed', 'delivery_created', 'delivery_assigned',
    'delivery_picked_up', 'delivery_en_route', 'delivery_delivered',
    'delivery_failed', 'delivery_retried', 'commerce_validation',
    'seo_issue_detected', 'commerce_rfq_created',
    'commerce_rfq_response_received', 'commerce_rfq_awarded', 'scheduled'
  ) NOT NULL,
  ADD COLUMN `schedule_every_minutes` INTEGER NULL,
  ADD COLUMN `next_schedule_at` DATETIME(3) NULL,
  ADD COLUMN `last_scheduled_at` DATETIME(3) NULL,
  ADD INDEX `workflows_schedule_due_idx` (`trigger_key`, `active`, `next_schedule_at`);

ALTER TABLE `workflow_versions`
  MODIFY `trigger_key` ENUM(
    'sale', 'booking_completed', 'lapsed_customer', 'low_stock', 'review',
    'credit_overdue', 'birthday', 'payment_received', 'complaint_received',
    'stock_changed', 'delivery_created', 'delivery_assigned',
    'delivery_picked_up', 'delivery_en_route', 'delivery_delivered',
    'delivery_failed', 'delivery_retried', 'commerce_validation',
    'seo_issue_detected', 'commerce_rfq_created',
    'commerce_rfq_response_received', 'commerce_rfq_awarded', 'scheduled'
  ) NOT NULL,
  ADD COLUMN `schedule_every_minutes` INTEGER NULL;
