/**
 * Field Service — tabs, status chips, lifecycle and default settings, ported from the design's
 * fs-core.js / fs-data.js. Only behaviour and labels live here; every record is a real row.
 */

export const FS_QUEUE = 'field-service';

export const FS_ERRORS = {
  NOT_FOUND: 'FIELD_NOT_FOUND',
  FORBIDDEN: 'PERMISSION_DENIED',
  INVALID: 'VALIDATION_ERROR',
  STATUS: 'WO_STATUS_INVALID',
  CONFLICT: 'VERSION_CONFLICT',
  SKILL: 'TECHNICIAN_SKILL_MISMATCH',
  UNAVAILABLE: 'TECHNICIAN_UNAVAILABLE',
  SCHEDULE: 'SCHEDULE_CONFLICT',
  PART: 'PART_NOT_AVAILABLE',
  DUPLICATE: 'DUPLICATE_OPERATION',
  APPROVAL: 'APPROVAL_REQUIRED',
  LOCKED: 'DISPATCH_LOCKED',
} as const;

/** [key, label, path, title, subtitle, icon] */
export const FS_TABS: [string, string, string, string, string, string][] = [
  [
    'overview',
    'Overview',
    '',
    'Field Service',
    'Manage requests, work orders, dispatch and technician execution.',
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5Z',
  ],
  [
    'requests',
    'Requests',
    '/requests',
    'Service Requests',
    'Capture and triage service needs before they become work orders',
    'M4 4h16v12H5l-1 4ZM8 9h8M8 12h5',
  ],
  [
    'workorders',
    'Work Orders',
    '/work-orders',
    'Work Orders',
    'Approved field jobs · lifecycle validated on every change',
    'M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01',
  ],
  [
    'dispatch',
    'Dispatch',
    '/dispatch',
    'Dispatch Board',
    'Technician lanes × time · every assignment is validated before it saves',
    'M3 6h18M3 12h18M3 18h18M8 3v18',
  ],
  [
    'calendar',
    'Calendar',
    '/calendar',
    'Service Calendar',
    'Field appointments from work orders · generic appointments stay in Bookings',
    'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  ],
  [
    'map',
    'Map',
    '/map',
    'Technician Map',
    'Where jobs and technicians are · location shown only where policy allows',
    'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
  ],
  [
    'detail',
    'Work Order',
    '/work-orders/',
    'Work Order Detail',
    'Execution page for one field job',
    'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  ],
  [
    'technician',
    'Technician',
    '/technician',
    'Technician Workspace',
    'My jobs today — one clear next action',
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  ],
  [
    'inspections',
    'Inspections',
    '/inspections',
    'Inspections & Checklists',
    'Versioned checklist templates and job evidence',
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4',
  ],
  [
    'parts',
    'Parts',
    '/parts',
    'Parts & Materials',
    'Field view of parts · Inventory confirms every stock movement',
    'M21 16V8l-9-5-9 5v8l9 5ZM3.3 7 12 12l8.7-5M12 22V12',
  ],
  [
    'labor',
    'Time & Labor',
    '/time-labor',
    'Time & Labor',
    'Field labor entries · payroll stays in People & Payroll',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  ],
  [
    'equipment',
    'Equipment',
    '/equipment',
    'Customer Equipment',
    'Field view of customer assets · Assets & Maintenance is the register',
    'M4 7h16v10H4zM8 21h8M12 17v4',
  ],
  [
    'pm',
    'Preventive',
    '/preventive-maintenance',
    'Preventive Maintenance',
    'Recurring service from time, usage or condition',
    'M3 12a9 9 0 1 0 3-6.7M3 3v6h6',
  ],
  [
    'agreements',
    'Agreements',
    '/service-agreements',
    'Service Agreements',
    'Operational entitlements · signed contracts stay in Contracts',
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4',
  ],
  [
    'warranty',
    'Warranty',
    '/warranty',
    'Warranty & Repairs',
    'Evidence-based warranty eligibility and repair execution',
    'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5Z',
  ],
  [
    'settings',
    'Settings',
    '/settings',
    'Field Service Settings',
    'Module behaviour · global branding and roles are unchanged',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ],
];

export const FS_CST: Record<string, [string, string, string]> = {
  Draft: ['#475467', '#F2F4F7', '✎'],
  Open: ['#175CD3', '#EFF8FF', '●'],
  Approved: ['#0E8442', '#ECFDF3', '✓'],
  Scheduled: ['#6941C6', '#F4F3FF', '◷'],
  Assigned: ['#175CD3', '#EFF8FF', '◉'],
  Dispatched: ['#175CD3', '#EFF8FF', '↗'],
  'En Route': ['#175CD3', '#EFF8FF', '→'],
  Arrived: ['#0E8442', '#ECFDF3', '⌂'],
  'In Progress': ['#B54708', '#FEF6E7', '▶'],
  Paused: ['#475467', '#F2F4F7', '❚❚'],
  'Awaiting Parts': ['#B42318', '#FEF3F2', '▣'],
  'Awaiting Customer': ['#B54708', '#FEF6E7', '◷'],
  'Awaiting Approval': ['#B54708', '#FEF6E7', '!'],
  Completed: ['#0E8442', '#ECFDF3', '✓'],
  Closed: ['#667085', '#F2F4F7', '■'],
  Cancelled: ['#667085', '#F2F4F7', '✕'],
  Healthy: ['#0E8442', '#ECFDF3', '●'],
  Warning: ['#B54708', '#FEF6E7', '◔'],
  'At Risk': ['#B42318', '#FEF3F2', '▲'],
  Breached: ['#B42318', '#FEF3F2', '✕'],
  Met: ['#0E8442', '#ECFDF3', '✓'],
  Ready: ['#0E8442', '#ECFDF3', '✓'],
  Missing: ['#B42318', '#FEF3F2', '✕'],
  Partial: ['#B54708', '#FEF6E7', '◑'],
  Unavailable: ['#667085', '#F2F4F7', '?'],
  None: ['#667085', '#F2F4F7', '–'],
  Needed: ['#475467', '#F2F4F7', '○'],
  Requested: ['#175CD3', '#EFF8FF', '↗'],
  Reserved: ['#6941C6', '#F4F3FF', '◆'],
  Issued: ['#175CD3', '#EFF8FF', '→'],
  Used: ['#0E8442', '#ECFDF3', '✓'],
  Returned: ['#667085', '#F2F4F7', '↩'],
  Available: ['#0E8442', '#ECFDF3', '●'],
  'On Job': ['#B54708', '#FEF6E7', '▶'],
  Break: ['#475467', '#F2F4F7', '❚❚'],
  'Off Duty': ['#667085', '#F2F4F7', '○'],
  New: ['#175CD3', '#EFF8FF', '●'],
  Untriaged: ['#B54708', '#FEF6E7', '?'],
  'Ready for Work Order': ['#0E8442', '#ECFDF3', '→'],
  Rejected: ['#667085', '#F2F4F7', '✕'],
  Converted: ['#0E8442', '#ECFDF3', '✓'],
  'Need More Information': ['#B54708', '#FEF6E7', '?'],
  Duplicate: ['#667085', '#F2F4F7', '≡'],
  'Sent to Helpdesk': ['#6941C6', '#F4F3FF', '↗'],
  Passed: ['#0E8442', '#ECFDF3', '✓'],
  Failed: ['#B42318', '#FEF3F2', '✕'],
  'Passed with exceptions': ['#B54708', '#FEF6E7', '!'],
  Pending: ['#475467', '#F2F4F7', '○'],
  'N/A': ['#667085', '#F2F4F7', '–'],
  Published: ['#0E8442', '#ECFDF3', '●'],
  Superseded: ['#667085', '#F2F4F7', '○'],
  Running: ['#B54708', '#FEF6E7', '▶'],
  Submitted: ['#175CD3', '#EFF8FF', '↗'],
  Active: ['#0E8442', '#ECFDF3', '●'],
  Expired: ['#B42318', '#FEF3F2', '⧗'],
  Suspended: ['#475467', '#F2F4F7', '❚❚'],
  'Renewing Soon': ['#B54708', '#FEF6E7', '↻'],
  Validating: ['#175CD3', '#EFF8FF', '…'],
  Eligible: ['#0E8442', '#ECFDF3', '✓'],
  'Not Eligible': ['#B42318', '#FEF3F2', '✕'],
  'Pending Validation': ['#B54708', '#FEF6E7', '?'],
  'Approval Required': ['#B54708', '#FEF6E7', '!'],
  'WO Created': ['#175CD3', '#EFF8FF', '→'],
  Repairing: ['#B54708', '#FEF6E7', '▶'],
  Paid: ['#0E8442', '#ECFDF3', '✓'],
  'Payment Link Sent': ['#175CD3', '#EFF8FF', '↗'],
  Processing: ['#175CD3', '#EFF8FF', '…'],
  'Not Required': ['#667085', '#F2F4F7', '–'],
  'Partially Paid': ['#B54708', '#FEF6E7', '◑'],
  Unpaid: ['#B54708', '#FEF6E7', '○'],
  'Pending Sync': ['#B54708', '#FEF6E7', '◷'],
  Syncing: ['#175CD3', '#EFF8FF', '…'],
  Synced: ['#0E8442', '#ECFDF3', '✓'],
  Fresh: ['#0E8442', '#ECFDF3', '●'],
  Stale: ['#B54708', '#FEF6E7', '⧗'],
  'Tracking off': ['#667085', '#F2F4F7', '○'],
};

/** Work-order lifecycle (fs-core.js WT) — every status change is validated against this. */
export const WT: Record<string, string[]> = {
  Draft: ['Open', 'Cancelled'],
  Open: ['Approved', 'Awaiting Approval', 'Cancelled'],
  'Awaiting Approval': ['Approved', 'Cancelled'],
  Approved: ['Scheduled', 'Assigned', 'Cancelled'],
  Scheduled: ['Assigned', 'Cancelled'],
  Assigned: ['Dispatched', 'Scheduled', 'Approved', 'Cancelled'],
  Dispatched: ['En Route', 'Assigned', 'Cancelled'],
  'En Route': ['Arrived', 'Dispatched'],
  Arrived: ['In Progress'],
  'In Progress': ['Paused', 'Awaiting Parts', 'Awaiting Customer', 'Completed'],
  Paused: ['In Progress'],
  'Awaiting Parts': ['In Progress', 'Scheduled', 'Assigned'],
  'Awaiting Customer': ['In Progress', 'Scheduled', 'Assigned'],
  Completed: ['Closed', 'In Progress'],
  Closed: ['In Progress'],
  Cancelled: [],
};
export const OPEN = [
  'Draft',
  'Open',
  'Awaiting Approval',
  'Approved',
  'Scheduled',
  'Assigned',
  'Dispatched',
  'En Route',
  'Arrived',
  'In Progress',
  'Paused',
  'Awaiting Parts',
  'Awaiting Customer',
];
export const DONE = ['Completed', 'Closed'];
export const REQ_STATUSES = [
  'New',
  'Untriaged',
  'Need More Information',
  'Awaiting Customer',
  'Ready for Work Order',
  'Converted',
  'Rejected',
  'Duplicate',
  'Sent to Helpdesk',
];
export const REQ_OPEN = [
  'New',
  'Untriaged',
  'Need More Information',
  'Awaiting Customer',
  'Ready for Work Order',
];
export const REQ_FINAL = [
  'Converted',
  'Rejected',
  'Duplicate',
  'Sent to Helpdesk',
];
export const CHANNELS = [
  'Phone',
  'Unified Inbox',
  'Customer Portal',
  'Helpdesk',
  'Website',
  'API',
  'Assets & Maintenance',
];
export const PRIORITIES = ['Emergency', 'Urgent', 'High', 'Normal', 'Low'];
export const LABOR_TYPES = [
  'Travel',
  'Standard Labor',
  'Diagnostic',
  'Installation',
  'Repair',
  'Inspection',
  'Waiting',
  'Training',
  'Other',
];
export const ITEM_TYPES = [
  'Yes/No',
  'Pass/Fail',
  'Text',
  'Number',
  'Measurement',
  'Photo',
  'Video',
  'Signature',
  'Barcode / QR',
  'Asset field',
  'Select',
  'Multi-select',
  'Date/time',
];
export const PLAN_TRIGGERS = [
  'Every X days',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Annually',
  'Usage hours',
];
export const TRIAGE_RESULTS = [
  'Valid Service Request',
  'Need More Information',
  'Duplicate',
  'Covered by Warranty',
  'Covered by Agreement',
  'Chargeable Service',
  'Remote Resolution Possible',
  'Create Work Order',
  'Send to Helpdesk',
  'Reject',
];
/** Technician hourly lanes on the dispatch board. */
export const SLOTS: [number, number][] = [
  [8, 10],
  [10, 12],
  [12, 14],
  [14, 16],
  [16, 18],
  [18, 20],
];

export const FS_SECS: [string, string][] = [
  ['services', 'Service types'],
  ['priorities', 'Priorities'],
  ['status', 'Work order status rules'],
  ['dispatch', 'Dispatch rules'],
  ['territories', 'Territories'],
  ['skills', 'Skills & certifications'],
  ['sla', 'SLA policies'],
  ['tech', 'Technician policies'],
  ['numbering', 'Work order numbering'],
  ['checklist', 'Checklist defaults'],
  ['parts', 'Parts rules'],
  ['labor', 'Labor rules'],
  ['proof', 'Customer proof'],
  ['pm', 'Preventive maintenance'],
  ['warranty', 'Warranty rules'],
  ['notify', 'Notifications'],
  ['offline', 'Mobile / offline'],
  ['approvals', 'Approval policies'],
];
/** Sections whose rows save immediately (records, not the versioned config). */
export const LIVE_SECS = ['services'];

export interface FsConfig {
  priorities: string[];
  status: { reopenApproval: boolean; cancelReason: boolean };
  dispatch: {
    autoSuggest: boolean;
    lockAfter: string;
    notifyTech: boolean;
    maxJobsPerDay: number;
  };
  territories: string[];
  /** Territory → neighbouring territories (drives the zone travel estimate). */
  adj: Record<string, string[]>;
  /** Zone travel estimate in minutes: same territory / neighbouring / anywhere else. */
  travel: { same: number; adj: number; other: number };
  skills: string[];
  certs: string[];
  sla: Record<string, number[]>;
  tech: {
    tracking: boolean;
    retentionDays: number;
    breakMin: number;
    staleMin: number;
  };
  numbering: { wo: string; sr: string };
  checklist: { requireAll: boolean; evidencePhoto: boolean };
  parts: { reserveOnSchedule: boolean; highValue: number };
  labor: {
    overlap: boolean;
    manualReason: boolean;
    roundMin: number;
    overtimeAfter: number;
  };
  proof: { signature: boolean; afterPhoto: boolean; resolution: boolean };
  pm: { leadDays: number; autoCreate: boolean };
  warranty: { repeatWindowDays: number; evidence: string };
  notify: {
    confirm: boolean;
    dispatched: boolean;
    arriving: boolean;
    delay: boolean;
    completed: boolean;
    quiet: string;
  };
  offline: { enabled: boolean; maxHours: number };
  approvals: {
    highValueParts: boolean;
    overtime: boolean;
    emergency: boolean;
    warrantyException: boolean;
    agreementOverride: boolean;
    cancellation: boolean;
    reopen: boolean;
  };
  /** Dispatch lock — operational state, not a versioned setting. */
  lock?: { by: string; userId: string; at: string } | null;
}

export const defaultFsConfig = (): FsConfig => ({
  priorities: [...PRIORITIES],
  status: { reopenApproval: true, cancelReason: true },
  dispatch: {
    autoSuggest: true,
    lockAfter: 'Dispatched',
    notifyTech: true,
    maxJobsPerDay: 6,
  },
  territories: [],
  adj: {},
  travel: { same: 12, adj: 28, other: 45 },
  skills: [
    'HVAC',
    'Refrigeration',
    'Plumbing',
    'Electrical',
    'IT Network',
    'Appliance',
    'Pest Control',
  ],
  certs: [],
  sla: {
    Emergency: [1, 2, 4],
    Urgent: [2, 4, 8],
    High: [4, 8, 24],
    Normal: [8, 24, 72],
    Low: [24, 72, 168],
  },
  tech: { tracking: true, retentionDays: 30, breakMin: 30, staleMin: 15 },
  numbering: { wo: 'FS-{000000}', sr: 'SR-{0000}' },
  checklist: { requireAll: true, evidencePhoto: true },
  parts: { reserveOnSchedule: true, highValue: 10000 },
  labor: { overlap: false, manualReason: true, roundMin: 15, overtimeAfter: 9 },
  proof: { signature: true, afterPhoto: true, resolution: true },
  pm: { leadDays: 7, autoCreate: true },
  warranty: { repeatWindowDays: 30, evidence: 'Serial + photo + install date' },
  notify: {
    confirm: true,
    dispatched: true,
    arriving: true,
    delay: true,
    completed: true,
    quiet: '21:00–08:00',
  },
  offline: { enabled: true, maxHours: 12 },
  approvals: {
    highValueParts: true,
    overtime: true,
    emergency: true,
    warrantyException: true,
    agreementOverride: true,
    cancellation: false,
    reopen: true,
  },
  lock: null,
});

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Saved config over defaults, so a key added later always has a value. */
export function mergeFsConfig(saved: unknown): FsConfig {
  const d = defaultFsConfig() as unknown as Record<string, unknown>;
  if (!isObj(saved)) return d as unknown as FsConfig;
  const out: Record<string, unknown> = { ...d };
  for (const [k, v] of Object.entries(saved)) {
    if (isObj(d[k]) && isObj(v) && k !== 'adj' && k !== 'sla')
      out[k] = { ...d[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  return out as unknown as FsConfig;
}

/** `FS-{000000}` + 154 → `FS-000154`. */
export function patternNumber(pattern: string, n: number): string {
  const m = /\{(0+)\}/.exec(pattern);
  if (!m) return `${pattern}${n}`;
  return pattern.replace(m[0], String(n).padStart(m[1].length, '0'));
}

export const PRIO_CELL: Record<string, [string, string, string]> = {
  Emergency: ['▲▲ Emergency', '#B42318', '#FEF3F2'],
  Urgent: ['▲ Urgent', '#B42318', '#FEF3F2'],
  High: ['● High', '#B54708', '#FEF6E7'],
  Normal: ['○ Normal', '#475467', '#F2F4F7'],
  Low: ['▽ Low', '#667085', '#F2F4F7'],
};
