import { SocialPlatform } from '@prisma/client';

export const INBOX_ERROR_CODES = {
  CONVERSATION_NOT_FOUND: 'INBOX_CONVERSATION_NOT_FOUND',
  CHANNEL_CANNOT_SEND: 'INBOX_CHANNEL_CANNOT_SEND',
  NOTHING_TO_REPLY_TO: 'INBOX_NOTHING_TO_REPLY_TO',
  NOT_YOURS: 'INBOX_NOT_YOURS',
  DRAFT_NOT_PENDING: 'INBOX_DRAFT_NOT_PENDING',
  DRAFT_NEEDS_MANAGER: 'INBOX_DRAFT_NEEDS_MANAGER',
  NO_FACTS: 'INBOX_NO_FACTS',
  AI_READ_OFF: 'INBOX_AI_READ_OFF',
  RULE_INVALID: 'INBOX_RULE_INVALID',
  REPLY_SLUG_TAKEN: 'INBOX_REPLY_SLUG_TAKEN',
  CUSTOMER_EXISTS: 'INBOX_CUSTOMER_EXISTS',
  INVALID_ASSIGNEE: 'INBOX_INVALID_ASSIGNEE',
} as const;

/** How a channel's messages get into and out of the inbox — `none` channels are listed honestly as not available. */
export type ChannelTransport = 'messaging' | 'social' | 'none';

export interface InboxChannelDef {
  key: string;
  label: string;
  /** Short name used on conversation chips. */
  short: string;
  transport: ChannelTransport;
  /** Set for `social` transport — the `SocialAccount.platform` it rides on. */
  platform?: SocialPlatform;
  /** Frontend `/inbox-icons/<icon>.png`; empty = initials badge. */
  icon: string;
  initials: string;
  /** What this channel really does in Noxtill today — shown on the Channels screen. */
  note: string;
}

/**
 * Every channel the design lists, with the transport that actually exists for it. `none` rows have
 * no inbound connector anywhere in this codebase (checked: no web chat widget, no Slack/Teams/Google
 * Chat/Viber inbound path, Google Business Messages was discontinued by Google in 2024).
 */
export const INBOX_CHANNELS: InboxChannelDef[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp Business',
    short: 'WhatsApp',
    transport: 'messaging',
    icon: 'whatsapp',
    initials: 'WA',
    note: 'Customer messages arrive through the WhatsApp webhook. Free-form replies only deliver inside the 24-hour window after the customer last wrote.',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    short: 'Instagram',
    transport: 'social',
    platform: SocialPlatform.instagram,
    icon: 'instagram',
    initials: 'IG',
    note: 'Direct messages and comments pulled by the Social connector land here.',
  },
  {
    key: 'facebook',
    label: 'Facebook Messenger',
    short: 'Facebook',
    transport: 'social',
    platform: SocialPlatform.facebook,
    icon: 'facebook',
    initials: 'FB',
    note: 'Page messages and comments pulled by the Social connector land here.',
  },
  {
    key: 'email',
    label: 'Email',
    short: 'Email',
    transport: 'messaging',
    icon: 'email',
    initials: 'EM',
    note: 'Replies and new messages go out from your sending address. Incoming email is not received by Noxtill, so email conversations only start from here.',
  },
  {
    key: 'sms',
    label: 'SMS',
    short: 'SMS',
    transport: 'messaging',
    icon: 'sms',
    initials: 'SM',
    note: 'Incoming texts are matched to a customer by phone number; a text from an unknown number cannot be tied to your business.',
  },
  {
    key: 'webchat',
    label: 'Website chat',
    short: 'Website chat',
    transport: 'none',
    icon: 'livechat',
    initials: 'WC',
    note: 'Noxtill has no website chat widget, so nothing can arrive from your website.',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    short: 'Telegram',
    transport: 'social',
    platform: SocialPlatform.telegram,
    icon: 'telegram',
    initials: 'TG',
    note: 'Connected through a bot token in Social. Only direct messages to the bot arrive here.',
  },
  {
    key: 'twitter',
    label: 'X',
    short: 'X',
    transport: 'social',
    platform: SocialPlatform.twitter,
    icon: 'x',
    initials: 'X',
    note: 'Mentions and replies pulled by the Social connector land here.',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    short: 'LinkedIn',
    transport: 'social',
    platform: SocialPlatform.linkedin,
    icon: 'linkedin',
    initials: 'LI',
    note: 'Comments on your company page posts land here once connected in Social.',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    short: 'TikTok',
    transport: 'social',
    platform: SocialPlatform.tiktok,
    icon: 'tiktok',
    initials: 'TT',
    note: 'Comments pulled by the Social connector land here once connected.',
  },
  {
    key: 'slack',
    label: 'Slack',
    short: 'Slack',
    transport: 'none',
    icon: 'slack',
    initials: 'SL',
    note: 'The Slack integration posts alerts to your team; it does not bring customer conversations in.',
  },
  {
    key: 'teams',
    label: 'Microsoft Teams',
    short: 'Teams',
    transport: 'none',
    icon: 'teams',
    initials: 'MT',
    note: 'There is no Microsoft Teams connector in Noxtill.',
  },
  {
    key: 'googlechat',
    label: 'Google Chat',
    short: 'Google Chat',
    transport: 'none',
    icon: 'googlechat',
    initials: 'GC',
    note: 'There is no Google Chat connector in Noxtill.',
  },
  {
    key: 'viber',
    label: 'Viber',
    short: 'Viber',
    transport: 'none',
    icon: 'viber',
    initials: 'VB',
    note: 'There is no Viber connector in Noxtill.',
  },
  {
    key: 'discord',
    label: 'Discord',
    short: 'Discord',
    transport: 'social',
    platform: SocialPlatform.discord,
    icon: 'discord',
    initials: 'DC',
    note: 'Connected through a bot token in Social.',
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    short: 'Pinterest',
    transport: 'social',
    platform: SocialPlatform.pinterest,
    icon: 'pinterest',
    initials: 'PT',
    note: 'Comments pulled by the Social connector land here once connected.',
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    short: 'Snapchat',
    transport: 'social',
    platform: SocialPlatform.snapchat,
    icon: 'snapchat',
    initials: 'SC',
    note: 'Pulled by the Social connector once connected.',
  },
  {
    key: 'gbm',
    label: 'Google Business',
    short: 'Google Business',
    transport: 'none',
    icon: '',
    initials: 'GB',
    note: 'Google switched off Business Messages in 2024, so there is nothing to connect.',
  },
];

/** Social platforms Noxtill can pull that the design doesn't list — still real, still shown when they carry conversations. */
const EXTRA_SOCIAL: SocialPlatform[] = [
  SocialPlatform.youtube,
  SocialPlatform.threads,
  SocialPlatform.reddit,
  SocialPlatform.tumblr,
  SocialPlatform.wechat,
  SocialPlatform.line,
];

export function channelDef(key: string): InboxChannelDef {
  const found = INBOX_CHANNELS.find((c) => c.key === key);
  if (found) return found;
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return {
    key,
    label,
    short: label,
    transport: EXTRA_SOCIAL.includes(key as SocialPlatform) ? 'social' : 'none',
    platform: EXTRA_SOCIAL.includes(key as SocialPlatform)
      ? (key as SocialPlatform)
      : undefined,
    icon: '',
    initials: label.slice(0, 2).toUpperCase(),
    note: '',
  };
}

/** WhatsApp/SMS/email — the channels whose replies go through `SendGateService`. */
export const MESSAGING_CHANNELS = ['whatsapp', 'sms', 'email'] as const;
export type MessagingChannelKey = (typeof MESSAGING_CHANNELS)[number];

export function isMessagingChannel(key: string): key is MessagingChannelKey {
  return (MESSAGING_CHANNELS as readonly string[]).includes(key);
}

/**
 * A "money question" (Settings → notify me when a money question comes in). A fixed, visible word
 * list — not an AI guess — so the notification only ever fires for a reason you can read.
 */
export const MONEY_WORDS = [
  'pay',
  'paid',
  'payment',
  'refund',
  'invoice',
  'balance',
  'owe',
  'bill',
  'receipt',
  'installment',
  'discount',
  'price',
];

export function mentionsAny(text: string, words: string[]): string | null {
  const lower = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  for (const w of words) {
    const word = w.trim().toLowerCase();
    if (!word) continue;
    if (lower.includes(` ${word} `) || lower.includes(` ${word}s `)) return w;
  }
  return null;
}

export const CONVERSATION_STATUSES = ['open', 'snoozed', 'closed'] as const;

export const RULE_TRIGGERS = ['keyword', 'unanswered', 'out_of_hours'] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export const TONES = ['warm', 'formal', 'brief'] as const;
export const LANGUAGES = ['match', 'en', 'ur'] as const;
export const ASSIGN_MODES = ['free', 'topic', 'none'] as const;

/** Every inbox event kind this module writes — the AI log filters on the `ai.` prefix. */
export const INBOX_EVENT = {
  ASSIGNED: 'assigned',
  SNOOZED: 'snoozed',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  TAGGED: 'tagged',
  RULE_TAGGED: 'rule.tagged',
  RULE_ROUTED: 'rule.routed',
  RULE_FLAGGED: 'rule.flagged',
  RULE_AWAY: 'rule.away_sent',
  AI_READ: 'ai.read',
  AI_DRAFTED: 'ai.drafted',
  AI_SKIPPED: 'ai.skipped',
  AI_SENT: 'ai.sent',
  AI_EDITED: 'ai.edited',
  AI_DISCARDED: 'ai.discarded',
  AI_TRANSLATED: 'ai.translated',
  AI_SUMMARISED: 'ai.summarised',
} as const;

/** AI call kinds, logged through `AiInfraService` like every other AI feature. */
export const INBOX_AI_KIND = {
  DRAFT: 'inbox_draft',
  TRANSLATE: 'inbox_translate',
  SUMMARY: 'inbox_summary',
} as const;

export const THREAD_SUMMARY_MIN_MESSAGES = 20;

/** One canonical handle per contact so an outbound-started thread and the reply land together. */
export function normalizeHandle(channel: string, raw: string): string {
  const trimmed = raw.trim();
  if (channel === 'whatsapp' || channel === 'sms') {
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `+${digits}` : trimmed;
  }
  if (channel === 'email') return trimmed.toLowerCase();
  return trimmed;
}
