import { MessageCategory } from '@prisma/client';
import { TemplateDefinition } from './template.types';

/**
 * Utility templates (transactional, always allowed regardless of opt-out) and
 * Marketing templates (promotional, blocked for opted-out customers) — spec
 * §3.1. Only `en` copy is seeded; add more locale keys per template as they're
 * translated, the registry falls back to `en` when a locale is missing.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  otp_code: {
    key: 'otp_code',
    category: MessageCategory.utility,
    locales: {
      en: 'Your verification code is {{code}}. It expires in {{ttlMinutes}} minutes. Never share this code.',
    },
  },
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
  /// Booking reminder rules (UPD-BE-092) — the shorter-fuse variant a rule can pick for
  /// close-to-appointment offsets (e.g. 2h out), same variables as `booking_reminder`.
  booking_reminder_urgent: {
    key: 'booking_reminder_urgent',
    category: MessageCategory.utility,
    locales: {
      en: 'Coming up soon: {{customerName}}, your {{serviceName}} appointment starts at {{dateTime}}. See you shortly!',
    },
  },
  booking_declined: {
    key: 'booking_declined',
    category: MessageCategory.utility,
    locales: {
      en: 'Sorry, your requested {{serviceName}} booking could not be confirmed. {{reason}}',
    },
  },
  booking_suggest_alternative: {
    key: 'booking_suggest_alternative',
    category: MessageCategory.utility,
    locales: {
      en: 'Your requested {{serviceName}} time isn’t available. Would {{dateTime}} work instead?',
    },
  },
  waitlist_offer: {
    key: 'waitlist_offer',
    category: MessageCategory.utility,
    locales: {
      en: 'Good news! A {{serviceName}} slot just opened up at {{dateTime}}. Reply to claim it.',
    },
  },
  missed_call: {
    key: 'missed_call',
    category: MessageCategory.utility,
    locales: {
      en: 'Sorry we missed your call to {{businessName}}! Reply here and we’ll help you right away.',
    },
  },
  queue_called: {
    key: 'queue_called',
    category: MessageCategory.utility,
    locales: {
      en: 'It’s your turn! Token #{{number}}, please come to the counter now.',
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
  /// Credit reminder rules (UPD-BE-095) — "firm" tone, for a rule's mid-stage escalation.
  credit_reminder_firm: {
    key: 'credit_reminder_firm',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, your balance of {{balance}} is still outstanding — please settle it as soon as you can.',
    },
  },
  /// Credit reminder rules (UPD-BE-095) — "final" tone, for a rule's last-stage escalation.
  credit_reminder_final: {
    key: 'credit_reminder_final',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, this is a final notice — your balance of {{balance}} remains unpaid. Please contact us immediately to settle it.',
    },
  },
  /// Statements screen's "send on WhatsApp" (UPD-FE-078).
  credit_statement_ready: {
    key: 'credit_statement_ready',
    category: MessageCategory.utility,
    locales: {
      en: 'Hi {{customerName}}, here is your latest statement: {{url}}',
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
  video_testimonial_request: {
    key: 'video_testimonial_request',
    category: MessageCategory.marketing,
    locales: {
      en: 'Hi {{customerName}}, would you record a short video testimonial for {{businessName}}? {{uploadUrl}}',
    },
  },
  campaign: {
    key: 'campaign',
    category: MessageCategory.marketing,
    locales: {
      en: '{{body}}',
    },
  },
  voucher_issued: {
    key: 'voucher_issued',
    category: MessageCategory.marketing,
    locales: {
      en: "Hi {{customerName}}, you've received a gift voucher worth {{amount}}! Code: {{code}}",
    },
  },
  automation_message: {
    key: 'automation_message',
    category: MessageCategory.marketing,
    locales: {
      en: '{{body}}',
    },
  },
};
