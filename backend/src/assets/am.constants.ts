/**
 * Assets & Maintenance — tab metadata, status colours, lifecycle transition tables and default
 * settings, ported from the design's assets-core.js / assets-data.js (settings only — no demo rows).
 */

/** [key, label, path, title, subtitle, icon] — assets-core.js TABS. */
export const AM_TABS: [string, string, string, string, string, string][] = [
  [
    'overview',
    'Overview',
    '',
    'Assets & Maintenance',
    'Monitor asset health, upcoming maintenance, downtime and reliability.',
    'M21 16V8l-9-5-9 5v8l9 5ZM12 12l9-4M12 12 3 8M12 12v9',
  ],
  [
    'register',
    'Asset Register',
    '/assets',
    'Asset Register',
    'Every individually tracked business and customer asset',
    'M4 6h16M4 12h16M4 18h10',
  ],
  [
    'detail',
    'Asset Detail',
    '/assets/',
    'Asset Detail',
    'Full lifecycle record for one asset',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v4l3 2',
  ],
  [
    'taxonomy',
    'Categories & Locations',
    '/categories-locations',
    'Asset Categories & Locations',
    'Classification and physical locations · branches come from Branches',
    'M3 7h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM10 10.5h4M17.5 10v4',
  ],
  [
    'requests',
    'Requests',
    '/requests',
    'Maintenance Requests',
    'Internal maintenance intake and triage',
    'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ],
  [
    'workorders',
    'Work Orders',
    '/work-orders',
    'Maintenance Work Orders',
    'Internal corrective and planned maintenance jobs',
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z',
  ],
  [
    'pm',
    'Preventive',
    '/preventive-maintenance',
    'Preventive Maintenance',
    'Recurring asset maintenance plans · generates work orders once per due instance',
    'M3 12a9 9 0 1 0 3-6.7M3 3v6h6M12 7v5l3 2',
  ],
  [
    'history',
    'Inspections & History',
    '/history',
    'Inspections & Service History',
    'Inspections, readings, services and condition changes',
    'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  ],
  [
    'analytics',
    'Downtime & Analytics',
    '/analytics',
    'Downtime & Maintenance Analytics',
    'Reliability, downtime and maintenance cost — every number drills to its records',
    'M3 3v18h18M7 15l4-4 3 3 5-6',
  ],
  [
    'settings',
    'Settings',
    '/settings',
    'Asset Settings',
    'Asset-specific rules · global terminology stays in Settings',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ],
];

/** Status colours [fg, bg, mark] — assets-core.js CST. */
export const AM_CST: Record<string, [string, string, string]> = {
  Draft: ['#475467', '#F2F4F7', '✎'],
  Active: ['#0E8442', '#ECFDF3', '●'],
  Inactive: ['#475467', '#F2F4F7', '○'],
  'Under Maintenance': ['#175CD3', '#EFF8FF', '⚙'],
  'Out of Service': ['#B42318', '#FEF3F2', '✕'],
  'In Storage': ['#6941C6', '#F4F3FF', '▣'],
  Transferred: ['#475467', '#F2F4F7', '→'],
  Retired: ['#667085', '#F2F4F7', '⏻'],
  Disposed: ['#667085', '#F2F4F7', '⌫'],
  Lost: ['#B42318', '#FEF3F2', '?'],
  Archived: ['#667085', '#F8F9FB', '▣'],
  Open: ['#175CD3', '#EFF8FF', '●'],
  'Awaiting Triage': ['#B54708', '#FEF6E7', '!'],
  'Needs Information': ['#B54708', '#FEF6E7', '?'],
  Approved: ['#0E8442', '#ECFDF3', '✓'],
  Rejected: ['#667085', '#F2F4F7', '✕'],
  Converted: ['#6941C6', '#F4F3FF', '→'],
  Closed: ['#667085', '#F2F4F7', '■'],
  Cancelled: ['#667085', '#F2F4F7', '✕'],
  Scheduled: ['#6941C6', '#F4F3FF', '◷'],
  Assigned: ['#175CD3', '#EFF8FF', '◉'],
  'In Progress': ['#175CD3', '#EFF8FF', '▶'],
  Paused: ['#475467', '#F2F4F7', '❚❚'],
  'Waiting Parts': ['#B54708', '#FEF6E7', '⧗'],
  'Waiting Vendor': ['#B54708', '#FEF6E7', '⧗'],
  Completed: ['#0E8442', '#ECFDF3', '✓'],
  'Closed — asset retired': ['#667085', '#F2F4F7', '■'],
};
export const AM_CONDC: Record<string, [string, string, string]> = {
  Excellent: ['#0E8442', '#ECFDF3', '◆◆◆◆'],
  Good: ['#0E8442', '#ECFDF3', '◆◆◆'],
  Fair: ['#B54708', '#FEF6E7', '◆◆'],
  Poor: ['#B42318', '#FEF3F2', '◆'],
  Critical: ['#B42318', '#FEF3F2', '✕'],
  Unknown: ['#475467', '#F2F4F7', '?'],
};
export const AM_CRITC: Record<string, [string, string, string]> = {
  Critical: ['#B42318', '#FEF3F2', '▲▲'],
  High: ['#B54708', '#FEF6E7', '▲'],
  Medium: ['#475467', '#F2F4F7', '●'],
  Low: ['#475467', '#F8F9FB', '▽'],
};

export const CONDITIONS = [
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Critical',
  'Unknown',
] as const;
export const LEVELS = ['Critical', 'High', 'Medium', 'Low'] as const;
export const OWNER_TYPES = [
  'Business-owned',
  'Customer-owned',
  'Leased',
  'Rented',
  'Supplier-owned',
  'Other',
] as const;
export const LOCATION_TYPES = [
  'Site',
  'Building',
  'Floor',
  'Area',
  'Room',
  'Functional Position',
] as const;
export const FINAL_ASSET = ['Retired', 'Disposed', 'Archived'];
export const OPEN_REQ = [
  'Draft',
  'Open',
  'Awaiting Triage',
  'Needs Information',
  'Approved',
];
export const DONE_WO = ['Closed', 'Cancelled', 'Completed'];

/** Work-order transitions — assets-core.js WO_T. */
export const WO_T: Record<string, string[]> = {
  Draft: ['Approved', 'Cancelled'],
  Approved: ['Scheduled', 'Assigned', 'Cancelled'],
  Scheduled: ['Assigned', 'In Progress', 'Cancelled'],
  Assigned: ['In Progress', 'Scheduled', 'Cancelled'],
  'In Progress': ['Paused', 'Waiting Parts', 'Waiting Vendor', 'Completed'],
  Paused: ['In Progress', 'Cancelled'],
  'Waiting Parts': ['In Progress', 'Cancelled'],
  'Waiting Vendor': ['In Progress', 'Cancelled'],
  Completed: ['Closed', 'In Progress'],
  Closed: [],
  Cancelled: [],
};
/** Row action label → target status — assets-core.js WO_ACT. */
export const WO_ACT: Record<string, string> = {
  Approve: 'Approved',
  Schedule: 'Scheduled',
  Assign: 'Assigned',
  Start: 'In Progress',
  Resume: 'In Progress',
  Pause: 'Paused',
  'Request Parts': 'Waiting Parts',
  'Waiting on vendor': 'Waiting Vendor',
  Complete: 'Completed',
  Close: 'Closed',
  Cancel: 'Cancelled',
  Reopen: 'In Progress',
};
/** Asset status transitions — assets-core.js ASSET_T. */
export const ASSET_T: Record<string, string[]> = {
  Draft: ['Active', 'Archived'],
  Active: [
    'Inactive',
    'Under Maintenance',
    'Out of Service',
    'In Storage',
    'Transferred',
    'Retired',
    'Lost',
  ],
  Inactive: ['Active', 'In Storage', 'Retired', 'Archived'],
  'Under Maintenance': ['Active', 'Out of Service', 'Retired'],
  'Out of Service': ['Active', 'Under Maintenance', 'Retired', 'Disposed'],
  'In Storage': ['Active', 'Retired', 'Disposed', 'Lost'],
  Transferred: ['Active'],
  Retired: ['Disposed', 'Archived'],
  Disposed: ['Archived'],
  Lost: ['Active', 'Disposed', 'Archived'],
  Archived: [],
};

/** Meter type → unit shown next to readings. */
export const METER_UNITS: Record<string, string> = {
  Hours: 'h',
  Kilometers: 'km',
  Cycles: 'cycles',
  'Units Produced': 'units',
};

export interface CritRule {
  level: string;
  /** Escalate open downtime longer than this many hours (null = never). */
  escalateHours: number | null;
  /** Owner | Manager | Team | None */
  escalateTo: string;
  /** Work orders whose estimated cost exceeds this start as Draft and need assets.approve. */
  approvalAbove: number;
}
export interface AmConfig {
  numbering: {
    prefix: string;
    pad: number;
    perBranch: boolean;
    manual: boolean;
    unique: string[];
  };
  statuses: { allowed: string[] };
  /** [condition, score|null] — Unknown is never scored. */
  condition: [string, number | null][];
  criticality: CritRule[];
  meters: string[];
  mtypes: string[];
  priorities: string[];
  dreasons: string[];
  wtypes: string[];
  pm: { lead: number; auto: boolean; reminder: string; tolerance: string };
  issueTypes: string[];
}

/** The design's settings object (assets-data.js) as structured, enforced defaults. */
export const defaultConfig = (): AmConfig => ({
  numbering: {
    prefix: 'AST-',
    pad: 4,
    perBranch: false,
    manual: true,
    unique: ['Asset tag', 'Serial number', 'Barcode'],
  },
  statuses: {
    allowed: [
      'Draft',
      'Active',
      'Inactive',
      'Under Maintenance',
      'Out of Service',
      'In Storage',
      'Transferred',
      'Retired',
      'Disposed',
      'Lost',
      'Archived',
    ],
  },
  condition: [
    ['Excellent', 100],
    ['Good', 80],
    ['Fair', 60],
    ['Poor', 35],
    ['Critical', 10],
    ['Unknown', null],
  ],
  criticality: [
    {
      level: 'Critical',
      escalateHours: 1,
      escalateTo: 'Owner',
      approvalAbove: 50000,
    },
    {
      level: 'High',
      escalateHours: 4,
      escalateTo: 'Manager',
      approvalAbove: 100000,
    },
    {
      level: 'Medium',
      escalateHours: null,
      escalateTo: 'Team',
      approvalAbove: 150000,
    },
    {
      level: 'Low',
      escalateHours: null,
      escalateTo: 'None',
      approvalAbove: 200000,
    },
  ],
  meters: ['Hours', 'Kilometers', 'Cycles', 'Units Produced'],
  mtypes: [
    'Preventive',
    'Corrective',
    'Emergency',
    'Inspection',
    'Calibration',
    'Repair',
    'Replacement',
    'Upgrade',
    'Inspection Follow-up',
    'Other',
  ],
  priorities: ['Critical', 'High', 'Medium', 'Low'],
  dreasons: [
    'Failure',
    'Maintenance',
    'Parts',
    'Vendor',
    'Power',
    'Safety',
    'Operator',
    'Other',
  ],
  wtypes: ['Manufacturer', 'Supplier', 'Extended', 'Service', 'Other'],
  pm: {
    lead: 7,
    auto: true,
    reminder: '3 days before due',
    tolerance: '±3 days / ±5% meter',
  },
  issueTypes: [
    'Failure',
    'Damage',
    'Noise/Vibration',
    'Leak',
    'Electrical',
    'Mechanical',
    'Safety',
    'Performance Degradation',
    'Inspection Finding',
    'Preventive Follow-up',
    'Other',
  ],
});

export const mergeConfig = (raw: unknown): AmConfig => {
  const d = defaultConfig();
  const r = (raw ?? {}) as Partial<AmConfig>;
  return {
    numbering: { ...d.numbering, ...(r.numbering ?? {}) },
    statuses: { ...d.statuses, ...(r.statuses ?? {}) },
    condition: Array.isArray(r.condition) ? r.condition : d.condition,
    criticality: Array.isArray(r.criticality) ? r.criticality : d.criticality,
    meters: Array.isArray(r.meters) ? r.meters : d.meters,
    mtypes: Array.isArray(r.mtypes) ? r.mtypes : d.mtypes,
    priorities: Array.isArray(r.priorities) ? r.priorities : d.priorities,
    dreasons: Array.isArray(r.dreasons) ? r.dreasons : d.dreasons,
    wtypes: Array.isArray(r.wtypes) ? r.wtypes : d.wtypes,
    pm: { ...d.pm, ...(r.pm ?? {}) },
    issueTypes: Array.isArray(r.issueTypes) ? r.issueTypes : d.issueTypes,
  };
};

/** Settings sections — assets-ui.js vSettings SECS. */
export const AM_SECS: [string, string, string][] = [
  ['numbering', 'Asset numbering', 'Format for new asset numbers.'],
  [
    'statuses',
    'Asset statuses',
    'Asset status is separate from work-order status.',
  ],
  [
    'condition',
    'Condition scale',
    'Values and scores used by the health score.',
  ],
  ['criticality', 'Criticality', 'Escalation and approval rules per level.'],
  ['meters', 'Meter types', ''],
  ['mtypes', 'Maintenance types', ''],
  ['priorities', 'Maintenance priority', ''],
  ['dreasons', 'Downtime reasons', ''],
  ['wtypes', 'Warranty types', ''],
  ['pm', 'PM defaults', 'Defaults for new preventive plans.'],
  [
    'perms',
    'Permissions',
    'Enforced server-side. Cost fields are gated separately.',
  ],
  [
    'custom',
    'Custom fields',
    'Asset-specific fields. Global terminology stays in Settings.',
  ],
  [
    'teams',
    'Maintenance teams',
    'Teams that assets, plans and work orders are assigned to.',
  ],
  [
    'templates',
    'PM templates',
    'Checklists copied onto generated work orders.',
  ],
];

/** Design permission rows → capability. */
export const PERM_ROWS: [string, string][] = [
  ['Open Assets & Maintenance', 'assets.view'],
  ['Create Asset', 'assets.create'],
  ['Edit Asset', 'assets.edit'],
  ['Transfer', 'assets.transfer'],
  ['Retire', 'assets.retire'],
  ['Create Request', 'assets.request'],
  ['Approve MWO', 'assets.approve'],
  ['Start MWO', 'assets.start'],
  ['Complete MWO', 'assets.complete'],
  ['Manage PM', 'assets.pm'],
  ['View Cost', 'assets.cost'],
  ['Export', 'assets.export'],
  ['Record Reading', 'assets.reading'],
  ['Asset Settings', 'assets.settings'],
];

export const AM_ERRORS = {
  NOT_FOUND: 'ASSET_NOT_FOUND',
  FORBIDDEN: 'PERMISSION_DENIED',
  INVALID: 'ASSETS_INVALID',
  TRANSITION: 'INVALID_STATUS_TRANSITION',
  DUPLICATE: 'DUPLICATE_ASSET',
  VERSION: 'VERSION_CONFLICT',
  READING: 'INVALID_METER_READING',
  PART: 'PART_NOT_AVAILABLE',
  PM_DUP: 'DUPLICATE_PM_DUE_INSTANCE',
  PM_CONFLICT: 'MAINTENANCE_PLAN_CONFLICT',
  CONFLICT: 'ASSETS_CONFLICT',
} as const;

/** Health penalties — assets-core.js health(). */
export const HEALTH = {
  openHighReq: -10,
  overduePm: -10,
  failure90: -8,
  down: -15,
  failedInsp30: -5,
};
