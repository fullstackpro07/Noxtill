import { MessageCategory } from '../../../generated/prisma';
import { TemplateDefinition } from './template.types';

/**
 * Utility templates (transactional, always allowed regardless of opt-out) and
 * Marketing templates (promotional, blocked for opted-out customers) — spec
 * §3.1. Only `en` copy is seeded; add more locale keys per template as they're
 * translated, the registry falls back to `en` when a locale is missing.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  booking_confirm: {
    key: 'booking_confirm',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, your booking for {{serviceName}} on {{dateTime}} is confirmed. See you then!',
    },
  },
  booking_reminder: {
    key: 'booking_reminder',
    category: MessageCategory.utility,
    locales: {
      en: 'Reminder: {{customerName}}, your {{serviceName}} appointment is at {{dateTime}}.',
    },
  },
  order_status: {
    key: 'order_status',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, your order #{{orderNo}} is now {{status}}.',
    },
  },
  receipt: {
    key: 'receipt',
    category: MessageCategory.utility,
    locales: {
      en: 'Thanks {{customerName}}! Your receipt for order #{{orderNo}} ({{total}}) is ready: {{receiptUrl}}',
    },
  },
  credit_reminder: {
    key: 'credit_reminder',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, a friendly reminder that you have an outstanding balance of {{balance}}.',
    },
  },
  owner_alert: {
    key: 'owner_alert',
    category: MessageCategory.utility,
    locales: {
      en: '{{alertTitle}}: {{alertBody}}',
    },
  },
  report_ready: {
    key: 'report_ready',
    category: MessageCategory.utility,
    locales: {
      en: 'Your {{reportLabel}} report is ready: {{url}}',
    },
  },
  nightly_close: {
    key: 'nightly_close',
    category: MessageCategory.utility,
    locales: {
      en: "Today's close for {{businessName}} — {{dateLabel}}: {{ordersCount}} orders, {{revenue}} revenue, {{grossProfit}} profit. {{alertsSummary}}View details: {{deepLink}}",
    },
  },
  birthday: {
    key: 'birthday',
    category: MessageCategory.utility,
    locales: {
      en: 'Happy birthday, {{customerName}}! 🎉 Wishing you a wonderful day from all of us at {{businessName}}.',
    },
  },
  review_request: {
    key: 'review_request',
    category: MessageCategory.marketing,
    locales: {
      en: 'Hi {{customerName}}, thanks for visiting {{businessName}}! Could you rate your experience? {{reviewUrl}}',
    },
  },
  feedback_reply: {
    key: 'feedback_reply',
    // Utility, not marketing: a direct customer-service reply to feedback the customer themselves
    // submitted must reach them even if they've opted out of marketing sends (BE-047).
    category: MessageCategory.utility,
    locales: {
      en: '{{message}}',
    },
  },
  campaign: {
    key: 'campaign',
    category: MessageCategory.marketing,
    locales: {
      en: '{{body}}',
    },
  },
};
