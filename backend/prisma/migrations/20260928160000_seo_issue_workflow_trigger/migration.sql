ALTER TABLE `activity_events`
  MODIFY `type` ENUM(
    'sale',
    'booking',
    'review',
    'payment',
    'complaint',
    'stock',
    'low_stock',
    'customer_lapsed',
    'credit_overdue',
    'birthday',
    'delivery',
    'commerce_validation',
    'seo_issue_detected'
  ) NOT NULL;

ALTER TABLE `workflows`
  MODIFY `trigger_key` ENUM(
    'sale',
    'booking_completed',
    'lapsed_customer',
    'low_stock',
    'review',
    'credit_overdue',
    'birthday',
    'payment_received',
    'complaint_received',
    'stock_changed',
    'delivery_created',
    'delivery_assigned',
    'delivery_picked_up',
    'delivery_en_route',
    'delivery_delivered',
    'delivery_failed',
    'delivery_retried',
    'commerce_validation',
    'seo_issue_detected'
  ) NOT NULL;

ALTER TABLE `workflow_versions`
  MODIFY `trigger_key` ENUM(
    'sale',
    'booking_completed',
    'lapsed_customer',
    'low_stock',
    'review',
    'credit_overdue',
    'birthday',
    'payment_received',
    'complaint_received',
    'stock_changed',
    'delivery_created',
    'delivery_assigned',
    'delivery_picked_up',
    'delivery_en_route',
    'delivery_delivered',
    'delivery_failed',
    'delivery_retried',
    'commerce_validation',
    'seo_issue_detected'
  ) NOT NULL;
