/**
 * People & Payroll — tabs, status chips, state machines and default settings, ported from the
 * design's pp-core.js. Labels and behaviour only: no tax rates, statutory amounts or leave
 * entitlements are built in — those are configured by the business.
 */

export const PP_QUEUE = 'people';
export const ENGINE = 'noxtill-payroll 1.0';
export const BASIS = ['Salaried', 'Hourly', 'Commission only'];
export const EMP_STATUS = ['Active', 'Probation', 'Notice', 'Exited'];
export const TAX_STATUS = ['Filer', 'Non-filer', 'Exempt'];
export const COURSE_TYPES = ['Mandatory', 'Optional', 'Certification'];
export const RATINGS_DEFAULT = ['Below', 'Meets', 'Exceeds', 'Outstanding'];

export const PP_ERRORS = {
  NOT_FOUND: 'PEOPLE_NOT_FOUND',
  FORBIDDEN: 'PERMISSION_DENIED',
  INVALID: 'VALIDATION_ERROR',
  STATUS: 'INVALID_STATUS_TRANSITION',
  STAGE: 'INVALID_STAGE_TRANSITION',
  CONFLICT: 'VERSION_CONFLICT',
  DUPLICATE: 'DUPLICATE_OPERATION',
  APPROVAL: 'APPROVAL_REQUIRED',
  BALANCE: 'INVALID_LEAVE_BALANCE',
  BLOCKING: 'PAYROLL_BLOCKING_EXCEPTION',
  SOD: 'SEPARATION_OF_DUTIES',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
} as const;

/** [key, label, path, title, subtitle, icon] */
export const PP_TABS: [string, string, string, string, string, string][] = [
  [
    'overview',
    'Overview',
    '',
    'People & Payroll',
    'Headcount, hiring, leave, payroll readiness and people alerts',
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ],
  [
    'recruitment',
    'Recruitment',
    '/recruitment',
    'Recruitment',
    'Hiring demand and funnel across open vacancies',
    'M3 3h18l-7 9v6l-4 2v-8Z',
  ],
  [
    'jobs',
    'Jobs',
    '/jobs',
    'Jobs & Vacancies',
    'Employment vacancies · not Staff roles or permissions',
    'M4 7h16v13H4zM9 7V4h6v3',
  ],
  [
    'applicants',
    'Applicants',
    '/applicants',
    'Applicants',
    'Employment candidates · never stored as CRM leads',
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  ],
  [
    'interviews',
    'Interviews',
    '/interviews',
    'Interviews',
    'Structured interviews with job-related scorecards',
    'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  ],
  [
    'offers',
    'Offers',
    '/offers',
    'Offers',
    'Approve, issue and track offers · signed files stay in Contracts',
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 15l2 2 4-4',
  ],
  [
    'onboarding',
    'Onboarding',
    '/onboarding',
    'Onboarding',
    'Pre-start and first-week onboarding · tasks live in Projects & Tasks',
    'M5 12l5 5L20 7',
  ],
  [
    'leave',
    'Leave',
    '/leave',
    'Leave & PTO',
    'Balances, requests and approvals · Staff and Bookings consume approved leave',
    'M8 3v4M16 3v4M4 8h16v13H4zM9 14h6',
  ],
  [
    'payroll',
    'Payroll',
    '/payroll',
    'Payroll',
    'Is everything ready before we calculate?',
    'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  [
    'runs',
    'Payroll Runs',
    '/payroll/runs',
    'Payroll Runs',
    'Calculate → review → approve → finalize → post → payout → verify',
    'M4 6h16M4 12h16M4 18h10',
  ],
  [
    'payslips',
    'Payslips',
    '/payslips',
    'Payslips',
    'Generated only from finalized payroll · delivered securely',
    'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  ],
  [
    'benefits',
    'Benefits',
    '/benefits',
    'Benefits & Deductions',
    'Effective-dated rules · history keeps the version it used',
    'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5Z',
  ],
  [
    'performance',
    'Performance',
    '/performance',
    'Performance & Appraisals',
    'Goals, reviews and development · human judgement, never auto-scored',
    'M3 3v18h18M7 15l4-4 3 3 5-6',
  ],
  [
    'training',
    'Training',
    '/training',
    'Training & Development',
    'Assignments, completion and certifications',
    'M22 10 12 5 2 10l10 5 10-5ZM6 12v5c3 2 9 2 12 0v-5',
  ],
  [
    'offboarding',
    'Offboarding',
    '/offboarding',
    'Offboarding',
    'Exit cases · Staff history is always preserved',
    'M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
  ],
];

export const STAGES = [
  'New',
  'Screening',
  'Shortlisted',
  'Interview',
  'Final Interview',
  'Offer',
  'Hired',
];

export const PP_CST: Record<string, [string, string, string]> = {
  Active: ['#0E8442', '#ECFDF3', '●'],
  'On Leave': ['#6941C6', '#F4F3FF', '◐'],
  Notice: ['#B54708', '#FEF6E7', '⧗'],
  Probation: ['#175CD3', '#EFF8FF', '◔'],
  Exited: ['#667085', '#F2F4F7', '○'],
  Draft: ['#475467', '#F2F4F7', '✎'],
  'Awaiting Approval': ['#B54708', '#FEF6E7', '!'],
  'Approval Required': ['#B54708', '#FEF6E7', '!'],
  Open: ['#175CD3', '#EFF8FF', '●'],
  Published: ['#0E8442', '#ECFDF3', '●'],
  'On Hold': ['#475467', '#F2F4F7', '❚❚'],
  Filled: ['#0E8442', '#ECFDF3', '✓'],
  Closed: ['#667085', '#F2F4F7', '■'],
  Cancelled: ['#667085', '#F2F4F7', '✕'],
  New: ['#175CD3', '#EFF8FF', '●'],
  Screening: ['#175CD3', '#EFF8FF', '◔'],
  Shortlisted: ['#6941C6', '#F4F3FF', '★'],
  Interview: ['#6941C6', '#F4F3FF', '◉'],
  'Final Interview': ['#6941C6', '#F4F3FF', '◉'],
  Offer: ['#B54708', '#FEF6E7', '✉'],
  Hired: ['#0E8442', '#ECFDF3', '✓'],
  Rejected: ['#667085', '#F2F4F7', '✕'],
  Withdrawn: ['#667085', '#F2F4F7', '↩'],
  Scheduled: ['#175CD3', '#EFF8FF', '◷'],
  Completed: ['#0E8442', '#ECFDF3', '✓'],
  'No-show': ['#B42318', '#FEF3F2', '✕'],
  Rescheduled: ['#B54708', '#FEF6E7', '↻'],
  'Feedback Overdue': ['#B42318', '#FEF3F2', '!'],
  Approved: ['#0E8442', '#ECFDF3', '✓'],
  'Document Generated': ['#175CD3', '#EFF8FF', '▤'],
  'Signature Requested': ['#175CD3', '#EFF8FF', '↗'],
  Sent: ['#175CD3', '#EFF8FF', '↗'],
  Viewed: ['#6941C6', '#F4F3FF', '◉'],
  Accepted: ['#0E8442', '#ECFDF3', '✓'],
  Declined: ['#B42318', '#FEF3F2', '✕'],
  Expired: ['#B42318', '#FEF3F2', '⧗'],
  Revised: ['#475467', '#F2F4F7', '↻'],
  'Not Started': ['#475467', '#F2F4F7', '○'],
  'In Progress': ['#B54708', '#FEF6E7', '▶'],
  Blocked: ['#B42318', '#FEF3F2', '⊘'],
  Submitted: ['#175CD3', '#EFF8FF', '↗'],
  Ready: ['#0E8442', '#ECFDF3', '✓'],
  Warning: ['#B54708', '#FEF6E7', '!'],
  Blocking: ['#B42318', '#FEF3F2', '⊘'],
  'Not Applicable': ['#667085', '#F2F4F7', '–'],
  'Not Tracked': ['#667085', '#F2F4F7', '–'],
  'Inputs Locked': ['#175CD3', '#EFF8FF', '🔒'],
  Calculating: ['#175CD3', '#EFF8FF', '…'],
  Calculated: ['#175CD3', '#EFF8FF', '='],
  Exceptions: ['#B42318', '#FEF3F2', '!'],
  Finalized: ['#6941C6', '#F4F3FF', '■'],
  'Finance Posting Pending': ['#B54708', '#FEF6E7', '◷'],
  'Finance Posted': ['#6941C6', '#F4F3FF', '✓'],
  'Payout Pending': ['#B54708', '#FEF6E7', '◷'],
  'Payout Submitted': ['#175CD3', '#EFF8FF', '↗'],
  Paid: ['#0E8442', '#ECFDF3', '✓'],
  'Partially Paid': ['#B54708', '#FEF6E7', '◑'],
  'Payout Failed': ['#B42318', '#FEF3F2', '✕'],
  Failed: ['#B42318', '#FEF3F2', '✕'],
  Processing: ['#175CD3', '#EFF8FF', '…'],
  Pending: ['#475467', '#F2F4F7', '○'],
  Generated: ['#175CD3', '#EFF8FF', '▤'],
  Delivered: ['#0E8442', '#ECFDF3', '✓'],
  'Delivery Failed': ['#B42318', '#FEF3F2', '✕'],
  Assigned: ['#175CD3', '#EFF8FF', '●'],
  Overdue: ['#B42318', '#FEF3F2', '!'],
  Verified: ['#0E8442', '#ECFDF3', '✓'],
  'Self Review': ['#175CD3', '#EFF8FF', '✎'],
  'Manager Review': ['#6941C6', '#F4F3FF', '✎'],
  Acknowledged: ['#0E8442', '#ECFDF3', '✓'],
  Planned: ['#475467', '#F2F4F7', '○'],
  Inactive: ['#667085', '#F2F4F7', '○'],
  Recorded: ['#475467', '#F2F4F7', '●'],
};

/** Payroll run lifecycle (pp-core.js RUN_T, payout through recorded bank transfers). */
export const RUN_T: Record<string, string[]> = {
  Draft: ['Inputs Locked', 'Cancelled'],
  'Inputs Locked': ['Calculated', 'Exceptions', 'Draft'],
  Exceptions: ['Calculated', 'Exceptions', 'Draft'],
  Calculated: ['Approval Required', 'Calculated', 'Draft'],
  'Approval Required': ['Approved', 'Calculated'],
  Approved: ['Finalized', 'Calculated'],
  Finalized: ['Finance Posting Pending', 'Finance Posted'],
  'Finance Posting Pending': ['Finance Posted', 'Finalized'],
  'Finance Posted': ['Payout Submitted'],
  'Payout Submitted': ['Paid', 'Partially Paid', 'Payout Failed'],
  'Partially Paid': ['Paid', 'Partially Paid', 'Payout Failed'],
  'Payout Failed': ['Partially Paid', 'Paid', 'Payout Failed'],
  Paid: [],
  Cancelled: [],
};
export const RUN_OPEN = [
  'Draft',
  'Inputs Locked',
  'Exceptions',
  'Calculated',
  'Approval Required',
  'Approved',
];
export const RUN_FINAL = [
  'Finalized',
  'Finance Posting Pending',
  'Finance Posted',
  'Payout Submitted',
  'Partially Paid',
  'Payout Failed',
  'Paid',
];

export const APP_T: Record<string, string[]> = {
  New: ['Screening', 'Rejected', 'Withdrawn'],
  Screening: ['Shortlisted', 'Interview', 'Rejected', 'Withdrawn'],
  Shortlisted: ['Interview', 'Rejected', 'Withdrawn'],
  Interview: ['Final Interview', 'Offer', 'Rejected', 'Withdrawn'],
  'Final Interview': ['Offer', 'Rejected', 'Withdrawn'],
  Offer: ['Hired', 'Rejected', 'Withdrawn'],
  Hired: [],
  Rejected: [],
  Withdrawn: [],
};
export const APP_CLOSED = ['Hired', 'Rejected', 'Withdrawn'];

export const SOURCES = [
  'Careers page',
  'Referral',
  'Job board',
  'LinkedIn',
  'Social media',
  'Walk-in',
  'Job fair',
  'Agency',
  'Other',
];
export const EMP_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];
export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
export const ROUNDS = [
  'Phone screen',
  'Technical',
  'Skills test',
  'Trial shift',
  'Final interview',
];
export const EXIT_TYPES = [
  'Resignation',
  'Termination',
  'Contract end',
  'Retirement',
];
export const RULE_TYPES = [
  'Benefit (employer-paid)',
  'Deduction',
  'Benefit (taxable)',
  'Statutory contribution',
  'Deduction + employer contribution',
];
export const TAX_TREATMENTS = ['Pre-tax', 'Post-tax', 'Taxable earning', 'N/A'];

export interface LeaveType {
  key: string;
  name: string;
  /** Days per leave year; null = no balance (e.g. unpaid). */
  entitlement: number | null;
  paid: boolean;
  /** Reason visible to HR only (e.g. medical). */
  sensitive: boolean;
  allowNegative: boolean;
}
export interface TaxSlab {
  /** Annual taxable income upper bound (null = no upper bound). */
  upTo: number | null;
  /** Marginal rate as a fraction (0.05 = 5%). */
  rate: number;
  /** Fixed tax owed on income below this slab's lower bound. */
  base: number;
}
export interface TaxTable {
  key: string;
  version: number;
  effectiveFrom: string;
  slabs: TaxSlab[];
  /** Multiplier applied to tax for employees whose tax status is Non-filer (1 = none). */
  nonFilerMultiplier: number;
  source: string;
}
export interface OnbItemTpl {
  ms: string;
  t: string;
  owner: string;
  /** Days relative to start date. */
  off: number;
  mand: boolean;
  /** doc | staff | access | payroll | task | training */
  kind: string;
}

export interface PpConfig {
  payroll: {
    payGroup: string;
    frequency: 'Monthly';
    workingDays: number;
    standardHours: number;
    overtimeWarnHours: number;
    advanceWarnAmount: number | null;
    separationOfDuties: boolean;
    costCenter: string;
    /** Day of month wages are paid (0 = last day). */ payDay: number;
    /** Finance account code net pay is paid from (null = Finance's expense default). */ paidFromCode:
      string | null;
    departments: string[];
  };
  tax: { tables: TaxTable[]; activeKey: string | null };
  leave: { types: LeaveType[]; yearStartMonth: number };
  recruiting: {
    offerApproverUserId: string | null;
    jobApprovalRequired: boolean;
    competencies: string[];
    hideFeedbackUntilSubmitted: boolean;
    offerTemplateId: string | null;
    careersEnabled: boolean;
    careersIntro: string;
    retentionMonths: number;
  };
  onboarding: { template: OnbItemTpl[] };
  offboarding: {
    template: { t: string; kind: string; mand: boolean; owner: string }[];
  };
  performance: { ratings: string[] };
  tasks: { projectId: string | null };
}

export const defaultPpConfig = (): PpConfig => ({
  payroll: {
    payGroup: 'Monthly payroll',
    frequency: 'Monthly',
    workingDays: 26,
    standardHours: 208,
    overtimeWarnHours: 10,
    advanceWarnAmount: null,
    separationOfDuties: true,
    costCenter: '',
    payDay: 0,
    paidFromCode: null,
    departments: [],
  },
  tax: { tables: [], activeKey: null },
  leave: { types: [], yearStartMonth: 1 },
  recruiting: {
    offerApproverUserId: null,
    jobApprovalRequired: true,
    competencies: ['Technical skill', 'Customer care', 'Hygiene & safety'],
    hideFeedbackUntilSubmitted: true,
    offerTemplateId: null,
    careersEnabled: false,
    careersIntro: '',
    retentionMonths: 12,
  },
  onboarding: {
    template: [
      {
        ms: 'Pre-start',
        t: 'Employment contract signed',
        owner: 'HR',
        off: -7,
        mand: true,
        kind: 'doc',
      },
      {
        ms: 'Pre-start',
        t: 'Bank and tax details on payroll profile',
        owner: 'HR',
        off: -3,
        mand: true,
        kind: 'payroll',
      },
      {
        ms: 'Day 1',
        t: 'System access (staff login)',
        owner: 'Owner',
        off: 0,
        mand: true,
        kind: 'access',
      },
      {
        ms: 'Day 1',
        t: 'Introduce to team and buddy',
        owner: 'Manager',
        off: 0,
        mand: false,
        kind: 'task',
      },
      {
        ms: 'Week 1',
        t: 'Mandatory training assigned',
        owner: 'HR',
        off: 3,
        mand: false,
        kind: 'training',
      },
    ],
  },
  offboarding: {
    template: [
      { t: 'Handover', kind: 'task', mand: true, owner: 'Handover owner' },
      { t: 'Revoke system access', kind: 'access', mand: true, owner: 'Owner' },
      {
        t: 'Return company assets',
        kind: 'asset',
        mand: true,
        owner: 'Manager',
      },
      {
        t: 'Final pay in payroll run',
        kind: 'payroll',
        mand: true,
        owner: 'Payroll',
      },
      { t: 'Experience letter', kind: 'doc', mand: false, owner: 'HR' },
    ],
  },
  performance: { ratings: ['Below', 'Meets', 'Exceeds', 'Outstanding'] },
  tasks: { projectId: null },
});

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function mergePpConfig(saved: unknown): PpConfig {
  const d = defaultPpConfig() as unknown as Record<string, unknown>;
  if (!isObj(saved)) return d as unknown as PpConfig;
  const out: Record<string, unknown> = { ...d };
  for (const [k, v] of Object.entries(saved))
    if (isObj(d[k]) && isObj(v)) out[k] = { ...d[k], ...v };
    else if (v !== undefined) out[k] = v;
  return out as unknown as PpConfig;
}

/** Annual progressive tax from a configured table, returned per month. */
export function monthlyTax(
  table: TaxTable,
  taxableMonthly: number,
  nonFiler: boolean,
) {
  const annual = Math.max(0, taxableMonthly * 12);
  let lower = 0;
  let tax = 0;
  for (const s of [...table.slabs].sort(
    (a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity),
  )) {
    const top = s.upTo ?? Infinity;
    if (annual <= top) {
      tax = s.base + (annual - lower) * s.rate;
      break;
    }
    lower = top;
  }
  return (
    Math.round((tax / 12) * (nonFiler ? table.nonFilerMultiplier : 1) * 100) /
    100
  );
}
