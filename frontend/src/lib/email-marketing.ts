export interface EmailTemplate {
  key: string;
  name: string;
  accentColor: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  { key: "promo", name: "Promo blast", accentColor: "var(--chart-2)" },
  { key: "newsletter", name: "Newsletter", accentColor: "var(--chart-1)" },
  { key: "announcement", name: "Announcement", accentColor: "var(--chart-3)" },
  { key: "winback", name: "We-miss-you", accentColor: "var(--chart-5)" },
];

export const SUBJECT_SUGGESTIONS = [
  "Your weekend glow-up starts here ✨",
  "We miss you, {{customerName}} — come back for 15% off",
  "New this month at {{businessName}}",
  "A little thank-you for our VIPs",
];

/** Mock funnel + list health — real send/report is BE-083, live wiring is INT-013. */
export const EMAIL_FUNNEL = { sent: 1200, opened: 540, clicked: 128, unsubscribed: 9 };
export const LIST_HEALTH = { subscribed: 812, unsubscribed: 34, bounced: 12 };
