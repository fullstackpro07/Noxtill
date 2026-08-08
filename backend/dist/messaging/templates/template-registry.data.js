"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_REGISTRY = void 0;
const prisma_1 = require("../../../generated/prisma");
exports.TEMPLATE_REGISTRY = {
    booking_confirm: {
        key: 'booking_confirm',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Hi {{customerName}}, your booking for {{serviceName}} on {{dateTime}} is confirmed. See you then!',
        },
    },
    booking_reminder: {
        key: 'booking_reminder',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Reminder: {{customerName}}, your {{serviceName}} appointment is at {{dateTime}}.',
        },
    },
    order_status: {
        key: 'order_status',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Hi {{customerName}}, your order #{{orderNo}} is now {{status}}.',
        },
    },
    receipt: {
        key: 'receipt',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Thanks {{customerName}}! Your receipt for order #{{orderNo}} ({{total}}) is ready: {{receiptUrl}}',
        },
    },
    credit_reminder: {
        key: 'credit_reminder',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Hi {{customerName}}, a friendly reminder that you have an outstanding balance of {{balance}}.',
        },
    },
    owner_alert: {
        key: 'owner_alert',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: '{{alertTitle}}: {{alertBody}}',
        },
    },
    report_ready: {
        key: 'report_ready',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Your {{reportLabel}} report is ready: {{url}}',
        },
    },
    nightly_close: {
        key: 'nightly_close',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: "Today's close for {{businessName}} — {{dateLabel}}: {{ordersCount}} orders, {{revenue}} revenue, {{grossProfit}} profit. {{alertsSummary}}View details: {{deepLink}}",
        },
    },
    birthday: {
        key: 'birthday',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Happy birthday, {{customerName}}! 🎉 Wishing you a wonderful day from all of us at {{businessName}}.',
        },
    },
    review_request: {
        key: 'review_request',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: 'Hi {{customerName}}, thanks for visiting {{businessName}}! Could you rate your experience? {{reviewUrl}}',
        },
    },
    feedback_reply: {
        key: 'feedback_reply',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: '{{message}}',
        },
    },
    campaign: {
        key: 'campaign',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: '{{body}}',
        },
    },
};
//# sourceMappingURL=template-registry.data.js.map