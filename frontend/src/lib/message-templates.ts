export interface MessageTemplateDef {
  key: string;
  label: string;
  category: "utility" | "marketing";
  /** Mirrors the backend template registry — only `en` has real copy today; other locales fall back to it. */
  locales: Record<string, string>;
}

export const MESSAGE_TEMPLATES: MessageTemplateDef[] = [
  {
    key: "booking_confirm",
    label: "Booking confirmation",
    category: "utility",
    locales: { en: "Hi {{customerName}}, your booking for {{serviceName}} on {{dateTime}} is confirmed. See you then!" },
  },
  {
    key: "booking_reminder",
    label: "Booking reminder",
    category: "utility",
    locales: { en: "Reminder: {{customerName}}, your {{serviceName}} appointment is at {{dateTime}}." },
  },
  {
    key: "order_status",
    label: "Order status update",
    category: "utility",
    locales: { en: "Hi {{customerName}}, your order #{{orderNo}} is now {{status}}." },
  },
  {
    key: "receipt",
    label: "Receipt",
    category: "utility",
    locales: { en: "Thanks for your purchase! Your receipt for order #{{orderNo}} is ready: {{receiptUrl}}" },
  },
  {
    key: "credit_reminder",
    label: "Credit payment reminder",
    category: "utility",
    locales: { en: "Hi {{customerName}}, a friendly reminder that you have a balance of {{balance}} with us." },
  },
  {
    key: "owner_alert",
    label: "Owner alert",
    category: "utility",
    locales: { en: "{{alertTitle}}: {{alertBody}}" },
  },
  {
    key: "nightly_close",
    label: "Nightly close summary",
    category: "utility",
    locales: { en: "Here's your day: {{revenue}} in sales, {{ordersCount}} orders, {{lowStockCount}} items low on stock." },
  },
  {
    key: "birthday",
    label: "Birthday greeting",
    category: "utility",
    locales: { en: "Happy birthday, {{customerName}}! From all of us at {{businessName}} 🎉" },
  },
  {
    key: "review_request",
    label: "Review request",
    category: "marketing",
    locales: { en: "Thanks for visiting! Mind leaving us a quick review? {{reviewUrl}}" },
  },
  {
    key: "campaign",
    label: "Marketing campaign",
    category: "marketing",
    locales: { en: "{{body}}" },
  },
];
