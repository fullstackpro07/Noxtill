"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_REGISTRY = void 0;
const prisma_1 = require("../../../generated/prisma");
exports.TEMPLATE_REGISTRY = {
    otp_code: {
        key: 'otp_code',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Your verification code is {{code}}. It expires in {{ttlMinutes}} minutes. Never share this code.',
        },
    },
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
    booking_declined: {
        key: 'booking_declined',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Sorry, your requested {{serviceName}} booking could not be confirmed. {{reason}}',
        },
    },
    booking_suggest_alternative: {
        key: 'booking_suggest_alternative',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Your requested {{serviceName}} time isn’t available. Would {{dateTime}} work instead?',
        },
    },
    waitlist_offer: {
        key: 'waitlist_offer',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'Good news! A {{serviceName}} slot just opened up at {{dateTime}}. Reply to claim it.',
        },
    },
    queue_called: {
        key: 'queue_called',
        category: prisma_1.MessageCategory.utility,
        locales: {
            en: 'It’s your turn! Token #{{number}}, please come to the counter now.',
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
    video_testimonial_request: {
        key: 'video_testimonial_request',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: 'Hi {{customerName}}, would you record a short video testimonial for {{businessName}}? {{uploadUrl}}',
        },
    },
    campaign: {
        key: 'campaign',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: '{{body}}',
        },
    },
    voucher_issued: {
        key: 'voucher_issued',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: 'Hi {{customerName}}, you\'ve received a gift voucher worth {{amount}}! Code: {{code}}',
        },
    },
    automation_message: {
        key: 'automation_message',
        category: prisma_1.MessageCategory.marketing,
        locales: {
            en: '{{body}}',
        },
    },
};
//# sourceMappingURL=template-registry.data.js.map