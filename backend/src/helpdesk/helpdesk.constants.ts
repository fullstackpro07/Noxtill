export const HELPDESK_QUEUE = 'helpdesk';

export const HD_ERRORS = {
  NOT_FOUND: 'HELPDESK_NOT_FOUND',
  FORBIDDEN: 'HELPDESK_FORBIDDEN',
  INVALID: 'HELPDESK_INVALID',
  CONFLICT: 'HELPDESK_CONFLICT',
  SEND_FAILED: 'HELPDESK_SEND_FAILED',
  PORTAL_INVALID: 'HELPDESK_PORTAL_INVALID',
} as const;

export const CHANNELS = [
  'Email',
  'WhatsApp',
  'Web',
  'Portal',
  'Phone',
  'Social',
  'Manual',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};
export const RAISE_PRIORITY: Record<string, string> = {
  Low: 'Normal',
  Normal: 'High',
  High: 'Urgent',
  Urgent: 'Urgent',
};

export const DEFAULT_STATUSES = [
  'New',
  'Open',
  'In Progress',
  'Waiting on Customer',
  'Waiting on Internal Team',
  'Resolved',
  'Closed',
];
export const CLOSED_STATUSES = ['Resolved', 'Closed'];
export const WAITING_STATUSES = [
  'Waiting on Customer',
  'Waiting on Internal Team',
];
export const isOpenStatus = (s: string) => !CLOSED_STATUSES.includes(s);

/** The 15 Helpdesk capabilities, in the order the Permissions matrix shows them. */
export const HD_CAPS = [
  'View all tickets',
  'View assigned tickets',
  'Reply',
  'Add internal notes',
  'Assign',
  'Reassign',
  'Change priority',
  'Resolve',
  'Close',
  'Merge',
  'Delete where allowed',
  'Manage SLA',
  'Manage settings',
  'View analytics',
  'View customer credit',
] as const;
export type HdCap = (typeof HD_CAPS)[number];
export const HD_ROLES = ['Owner', 'Manager', 'Agent'] as const;

export const DEFAULT_PERMS: Record<HdCap, [number, number, number]> = {
  'View all tickets': [1, 1, 0],
  'View assigned tickets': [1, 1, 1],
  Reply: [1, 1, 1],
  'Add internal notes': [1, 1, 1],
  Assign: [1, 1, 1],
  Reassign: [1, 1, 0],
  'Change priority': [1, 1, 1],
  Resolve: [1, 1, 1],
  Close: [1, 1, 0],
  Merge: [1, 1, 0],
  'Delete where allowed': [1, 0, 0],
  'Manage SLA': [1, 1, 0],
  'Manage settings': [1, 0, 0],
  'View analytics': [1, 1, 0],
  'View customer credit': [1, 1, 0],
};

export const NOTIFY_EVENTS = [
  'New ticket',
  'Assignment',
  'Customer reply',
  'SLA risk',
  'SLA breach',
  'Escalation',
  'Negative CSAT',
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export const NOTIFY_CHANNELS = ['In-app', 'Email', 'SMS'];

export const AUTO_CLOSE_OPTIONS = [
  'Never',
  '3 days after Resolved',
  '5 days after Resolved',
  '7 days after Resolved',
  '14 days after Resolved',
];
export const REOPEN_OPTIONS = [
  'Customer reply within 7 days reopens',
  'Customer reply within 14 days reopens',
  'Customer reply within 30 days reopens',
  'Never — create a new ticket',
];
export const HOME_BRANCH = 'Customer’s home branch';
export const CSAT_DELAYS: Record<string, number> = {
  Immediately: 0,
  '30 minutes': 30,
  '2 hours': 120,
  '24 hours': 1440,
};
export const CSAT_SCALES = ['1–5 stars', 'Good / Bad', '1–10'];
export const CSAT_CHANNELS = ['Email', 'WhatsApp', 'Portal', 'SMS', 'Social'];
export const CSAT_FOLLOWUPS = [
  'Rating ≤ 2 creates internal follow-up',
  'Rating ≤ 3 creates internal follow-up',
  'No automatic follow-up',
];
export const RETENTION_CLOSED = [
  '1 year',
  '2 years',
  '3 years',
  '5 years',
  '7 years',
];
export const RETENTION_ATTACHMENTS = [
  '90 days after close',
  '1 year after close',
  'Same as ticket',
];

export interface HelpdeskConfig {
  general: {
    defaultQueue: string;
    defaultPriority: string;
    numberFormat: string;
    defaultBranch: string;
    autoClose: string;
    reopen: string;
  };
  statuses: string[];
  customStatuses: string[];
  priorities: string[];
  categories: string[];
  assignment: {
    method: string;
    respectCapacity: boolean;
    skipAway: boolean;
    reassignOnLeave: boolean;
  };
  /** days: Mon..Sun labels; holidays: comma-separated YYYY-MM-DD dates. */
  hours: {
    tz: string;
    days: string[];
    open: string;
    close: string;
    holidays: string;
  };
  sla: { warn: number; pauseWaiting: boolean; pauseInternal: boolean };
  notify: Record<string, string[]>;
  comms: { signature: string; ack: boolean; ackText: string; lang: string };
  csat: {
    enabled: boolean;
    delay: string;
    scale: string;
    comment: boolean;
    channels: string[];
    followUp: string;
  };
  perms: Record<string, number[]>;
  retention: {
    closed: string;
    attachments: string;
    notes: string;
    purge: string;
  };
  advanced: {
    ticketMerge: boolean;
    split: boolean;
    collision: boolean;
    apiAccess: string;
  };
  kbCategories: string[];
}

export function defaultConfig(timezone = 'UTC'): HelpdeskConfig {
  return {
    general: {
      defaultQueue: 'Unassigned',
      defaultPriority: 'Normal',
      numberFormat: 'HD-{#####}',
      defaultBranch: HOME_BRANCH,
      autoClose: '7 days after Resolved',
      reopen: 'Customer reply within 14 days reopens',
    },
    statuses: [...DEFAULT_STATUSES],
    customStatuses: [],
    priorities: [...PRIORITIES],
    categories: [
      'General',
      'Billing',
      'Technical',
      'Complaint',
      'Booking',
      'Order',
      'Payment',
    ],
    assignment: {
      method: 'Per queue',
      respectCapacity: true,
      skipAway: true,
      reassignOnLeave: false,
    },
    hours: {
      tz: timezone,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      open: '09:00',
      close: '20:00',
      holidays: '',
    },
    sla: { warn: 75, pauseWaiting: true, pauseInternal: false },
    notify: {
      'New ticket': ['In-app'],
      Assignment: ['In-app', 'Email'],
      'Customer reply': ['In-app'],
      'SLA risk': ['In-app', 'Email'],
      'SLA breach': ['In-app', 'Email'],
      Escalation: ['In-app', 'Email'],
      'Negative CSAT': ['In-app', 'Email'],
    },
    comms: {
      signature: '— {{agent_name}}',
      ack: false,
      ackText:
        'We’ve received your request ({{ticket_number}}). We usually reply within 4 hours.',
      lang: 'English',
    },
    csat: {
      enabled: true,
      delay: '2 hours',
      scale: '1–5 stars',
      comment: true,
      channels: ['Email', 'WhatsApp', 'Portal'],
      followUp: CSAT_FOLLOWUPS[0],
    },
    perms: Object.fromEntries(
      Object.entries(DEFAULT_PERMS).map(([k, v]) => [k, [...v]]),
    ),
    retention: {
      closed: '3 years',
      attachments: '1 year after close',
      notes: 'Same as ticket',
      purge: 'Monthly, audited',
    },
    advanced: {
      ticketMerge: true,
      split: true,
      collision: true,
      apiAccess: 'Not available — Helpdesk has no public API yet',
    },
    kbCategories: ['General', 'Billing', 'Orders', 'Account', 'Internal'],
  };
}

/** Stored config merged section-by-section over defaults, so keys added later are never undefined. */
export function mergeConfig(raw: unknown, timezone = 'UTC'): HelpdeskConfig {
  const d = defaultConfig(timezone);
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const obj = <T extends object>(k: keyof HelpdeskConfig, base: T): T => ({
    ...base,
    ...((s[k] as object) ?? {}),
  });
  const arr = (k: keyof HelpdeskConfig, base: string[]) =>
    Array.isArray(s[k]) ? (s[k] as unknown[]).map(String) : base;
  const perms = {
    ...d.perms,
    ...((s.perms as Record<string, number[]>) ?? {}),
  };
  for (const cap of HD_CAPS)
    perms[cap] = [
      1,
      Number(perms[cap]?.[1] ?? 0) ? 1 : 0,
      Number(perms[cap]?.[2] ?? 0) ? 1 : 0,
    ];
  return {
    general: obj('general', d.general),
    statuses: [...DEFAULT_STATUSES],
    customStatuses: arr('customStatuses', d.customStatuses),
    priorities: [...PRIORITIES],
    categories: arr('categories', d.categories),
    assignment: obj('assignment', d.assignment),
    hours: obj('hours', d.hours),
    sla: obj('sla', d.sla),
    notify: { ...d.notify, ...((s.notify as Record<string, string[]>) ?? {}) },
    comms: obj('comms', d.comms),
    csat: obj('csat', d.csat),
    perms,
    retention: obj('retention', d.retention),
    advanced: {
      ...obj('advanced', d.advanced),
      apiAccess: d.advanced.apiAccess,
    },
    kbCategories: arr('kbCategories', d.kbCategories),
  };
}

/** Sections of the config the Settings screen saves (each diff is audited as one change). */
export const SETTINGS_SECTIONS: Array<keyof HelpdeskConfig> = [
  'general',
  'customStatuses',
  'categories',
  'assignment',
  'hours',
  'sla',
  'notify',
  'comms',
  'csat',
  'perms',
  'retention',
  'advanced',
];

export const SLA_APPLIES = [
  'All Tickets',
  'Specific Priority',
  'Category',
  'Queue',
  'Customer Segment',
  'Branch',
];
export const RULE_TRIGGERS = [
  'SLA At Risk',
  'SLA Breached',
  'Priority = Urgent',
  'No Agent Assigned',
  'Ticket Age',
];
export const RULE_ACTIONS = [
  'Notify',
  'Reassign',
  'Move queue',
  'Raise priority',
  'Create internal alert',
];
export const QUEUE_METHODS = [
  'Manual',
  'Round Robin',
  'Least Loaded',
  'Skill Based',
  'Branch Based',
];
export const QUEUE_PRIORITY_RULES = [
  'None',
  'Urgent first',
  'VIP first',
  'Oldest first',
];
export const ESCALATION_REASONS = [
  'SLA at risk',
  'Customer complaint',
  'VIP customer',
  'Technical blocker',
  'Needs manager approval',
  'Other',
];
export const ARTICLE_VISIBILITY = [
  'Internal Only',
  'Customer Portal',
  'Public',
];
export const REPLY_VARIABLES = ['customer_name', 'ticket_number', 'agent_name'];
export const MACRO_ACTIONS = [
  'Insert reply',
  'Set status',
  'Set priority',
  'Assign queue',
  'Assign agent',
  'Add tag',
];

/** Link types backed by a real record in Noxtill, and the prefix their ids are shown with. */
export const LINK_TYPES: Record<
  string,
  { prefix: string; module: string; available: boolean; why?: string }
> = {
  Order: { prefix: 'ORD-', module: 'Orders', available: true },
  Booking: { prefix: 'BK-', module: 'Bookings', available: true },
  Project: { prefix: 'PRJ-', module: 'Projects & Tasks', available: true },
  Invoice: {
    prefix: 'INV-',
    module: 'Finance & Accounting',
    available: false,
    why: 'Noxtill has no invoicing module yet — link the order instead.',
  },
  Payment: {
    prefix: 'PAY-',
    module: 'Payments & Billing',
    available: false,
    why: 'Payments have no standalone number in Noxtill — link the order they were taken on.',
  },
  Contract: { prefix: 'CTR-', module: 'Contracts', available: true },
  Asset: {
    prefix: 'FA-',
    module: 'Finance & Accounting › Fixed Assets',
    available: true,
  },
  'Field Service job': {
    prefix: 'FS-',
    module: 'Field Service',
    available: true,
  },
};

/** Attachment types accepted on tickets (checked by extension and by content via validateUploadedFile). */
export const FILE_OK = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'pdf',
  'txt',
  'csv',
  'doc',
  'docx',
  'xls',
  'xlsx',
];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const PAGE_SIZE = 12;

/** Seeded on first use so a new helpdesk works out of the box; everything is editable afterwards. */
export const SEED_QUEUES = [
  {
    name: 'Unassigned',
    description: 'Tickets waiting for first assignment. System queue.',
    systemKey: 'unassigned',
    categories: [] as string[],
    method: 'Manual',
  },
  {
    name: 'General Support',
    description: 'Everyday questions, orders, accounts and bookings.',
    systemKey: null,
    categories: ['General', 'Order', 'Booking'],
    method: 'Manual',
  },
  {
    name: 'Billing',
    description: 'Charges, refunds, invoices and statements.',
    systemKey: null,
    categories: ['Billing', 'Payment'],
    method: 'Manual',
  },
  {
    name: 'Escalations',
    description: 'Escalated tickets owned by a lead.',
    systemKey: 'escalations',
    categories: [] as string[],
    method: 'Manual',
  },
];

export const SEED_SLAS = [
  {
    name: 'Urgent priority',
    applies: 'Specific Priority',
    scope: 'Urgent',
    priority: 'Urgent',
    fr: 30,
    res: 240,
    hours: '24/7',
  },
  {
    name: 'High priority',
    applies: 'Specific Priority',
    scope: 'High',
    priority: 'High',
    fr: 60,
    res: 480,
    hours: 'Standard hours',
  },
  {
    name: 'Standard',
    applies: 'All Tickets',
    scope: '',
    priority: 'Normal',
    fr: 240,
    res: 1440,
    hours: 'Standard hours',
  },
  {
    name: 'Low priority',
    applies: 'Specific Priority',
    scope: 'Low',
    priority: 'Low',
    fr: 480,
    res: 4320,
    hours: 'Standard hours',
  },
];

/** How a public reply on each channel reaches the customer. */
export const VIA: Record<string, string> = {
  Email: 'Email',
  WhatsApp: 'WhatsApp',
  Web: 'Email',
  Portal: 'Customer Portal',
  Phone: 'SMS',
  Social: 'Social DM',
  Manual: 'Email',
};

/** Unified Inbox channel key → Helpdesk channel. */
export function channelFromInbox(key: string): Channel {
  if (key === 'whatsapp') return 'WhatsApp';
  if (key === 'email') return 'Email';
  if (key === 'sms') return 'Phone';
  return 'Social';
}

/** Helpdesk channel → the CSAT survey channel it is sent on. */
export const CSAT_CHANNEL_OF: Record<string, string> = {
  Email: 'Email',
  WhatsApp: 'WhatsApp',
  Portal: 'Portal',
  Web: 'Email',
  Manual: 'Email',
  Social: 'Social',
  Phone: 'SMS',
};
