/**
 * Contracts — tabs, status chips, contract lifecycle, typed template variables and default settings,
 * ported from the design's contracts-core.js / contracts-data.js. Behaviour and labels only.
 */

export const CT_QUEUE = 'contracts';

export const CT_ERRORS = {
  NOT_FOUND: 'CONTRACTS_NOT_FOUND',
  FORBIDDEN: 'PERMISSION_DENIED',
  INVALID: 'VALIDATION_ERROR',
  STATUS: 'INVALID_STATUS_TRANSITION',
  CONFLICT: 'VERSION_CONFLICT',
  DUPLICATE: 'DUPLICATE_OPERATION',
  HOLD: 'LEGAL_HOLD',
  RETENTION: 'RETENTION_BLOCK',
  FILE: 'UNSUPPORTED_FILE',
  TOO_LARGE: 'FILE_TOO_LARGE',
  APPROVAL: 'APPROVAL_REQUIRED',
  SIGNER: 'MISSING_SIGNER',
  SIGN: 'SIGNATURE_INVALID',
} as const;

/** [key, label, path, title, subtitle, icon] */
export const CT_TABS: [string, string, string, string, string, string][] = [
  [
    'overview',
    'Overview',
    '',
    'Contracts',
    'Manage documents, contracts, approvals, signatures and renewals.',
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M8 17c1.5-2 2.5-2 3 0s1.5 1 2.5-.5',
  ],
  [
    'documents',
    'Documents',
    '/documents',
    'Document Library',
    'The one repository for formal Noxtill documents · other modules link by document ID',
    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  ],
  [
    'templates',
    'Templates',
    '/templates',
    'Templates',
    'Formal document and contract templates with typed variables · email templates stay in Marketing',
    'M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z',
  ],
  [
    'contracts',
    'Contracts',
    '/all',
    'Contracts',
    'Contract register and lifecycle',
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4',
  ],
  [
    'detail',
    'Contract Detail',
    '/',
    'Contract Detail',
    'Single-contract workspace',
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v4l3 2',
  ],
  [
    'signatures',
    'Signatures',
    '/signatures',
    'Signature Requests',
    'Prepare, send and evidence e-signatures · every signature is recorded with its evidence trail',
    'M3 17c3-3 5-8 7-8s1 6 3 6 3-4 5-4M3 21h18',
  ],
  [
    'approvals',
    'Approvals',
    '/approvals',
    'Approval Workflows',
    'Document & contract approvals · decided step by step with four-eyes control',
    'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  ],
  [
    'expiries',
    'Expiries & Renewals',
    '/expiries',
    'Expiries & Renewals',
    'Expiry dates, notice deadlines and renewal decisions',
    'M3 12a9 9 0 1 0 3-6.7M3 3v6h6M12 7v5l3 2',
  ],
  [
    'compliance',
    'Compliance',
    '/compliance',
    'Compliance Documents',
    'Policies, licences, certificates and acknowledgements — evidence register',
    'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5Z',
  ],
  [
    'settings',
    'Settings',
    '/settings',
    'Document & eSign Settings',
    'Module policies · global roles and branding are unchanged',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  ],
];

export const CT_CST: Record<string, [string, string, string]> = {
  Draft: ['#475467', '#F2F4F7', '✎'],
  'Internal Review': ['#175CD3', '#EFF8FF', '◷'],
  'Approval Required': ['#B54708', '#FEF6E7', '!'],
  Approved: ['#0E8442', '#ECFDF3', '✓'],
  'Signature Pending': ['#175CD3', '#EFF8FF', '✍'],
  'Partially Signed': ['#175CD3', '#EFF8FF', '◑'],
  Signed: ['#0E8442', '#ECFDF3', '✓'],
  Active: ['#0E8442', '#ECFDF3', '●'],
  Expiring: ['#B54708', '#FEF6E7', '⧗'],
  'Renewal Review': ['#B54708', '#FEF6E7', '↻'],
  Renewed: ['#0E8442', '#ECFDF3', '↻'],
  'Amendment Draft': ['#6941C6', '#F4F3FF', '✎'],
  Terminated: ['#B42318', '#FEF3F2', '■'],
  Expired: ['#B42318', '#FEF3F2', '⧗'],
  Archived: ['#667085', '#F2F4F7', '▣'],
  Voided: ['#667085', '#F2F4F7', '✕'],
  Prepared: ['#475467', '#F2F4F7', '▤'],
  'Pending Approval': ['#B54708', '#FEF6E7', '!'],
  Queued: ['#475467', '#F2F4F7', '…'],
  Sending: ['#175CD3', '#EFF8FF', '…'],
  Sent: ['#175CD3', '#EFF8FF', '↗'],
  Delivered: ['#175CD3', '#EFF8FF', '✓'],
  Viewed: ['#6941C6', '#F4F3FF', '◉'],
  Completed: ['#0E8442', '#ECFDF3', '✓'],
  Declined: ['#B42318', '#FEF3F2', '✕'],
  Failed: ['#B42318', '#FEF3F2', '✕'],
  'Provider Failed': ['#B42318', '#FEF3F2', '✕'],
  'Delivery Failed': ['#B42318', '#FEF3F2', '✕'],
  Pending: ['#B54708', '#FEF6E7', '◷'],
  Waiting: ['#475467', '#F2F4F7', '○'],
  'Not sent': ['#475467', '#F2F4F7', '○'],
  'Not requested': ['#475467', '#F2F4F7', '○'],
  Requested: ['#175CD3', '#EFF8FF', '↗'],
  Rejected: ['#B42318', '#FEF3F2', '✕'],
  'Changes Requested': ['#B54708', '#FEF6E7', '↩'],
  Delegated: ['#6941C6', '#F4F3FF', '→'],
  Escalated: ['#B42318', '#FEF3F2', '▲'],
  Cancelled: ['#667085', '#F2F4F7', '✕'],
  Ready: ['#0E8442', '#ECFDF3', '●'],
  Processing: ['#175CD3', '#EFF8FF', '…'],
  'Approval Pending': ['#B54708', '#FEF6E7', '!'],
  'Review Required': ['#B54708', '#FEF6E7', '!'],
  Published: ['#0E8442', '#ECFDF3', '●'],
  Superseded: ['#667085', '#F2F4F7', '○'],
  Partial: ['#175CD3', '#EFF8FF', '◑'],
  Upcoming: ['#175CD3', '#EFF8FF', '◷'],
  'Due Soon': ['#B54708', '#FEF6E7', '⧗'],
  Due: ['#B54708', '#FEF6E7', '!'],
  Overdue: ['#B42318', '#FEF3F2', '!'],
  Waived: ['#667085', '#F2F4F7', '–'],
  'Not Due': ['#475467', '#F2F4F7', '○'],
  'Renewal Draft': ['#6941C6', '#F4F3FF', '✎'],
  'Will Not Renew': ['#667085', '#F2F4F7', '■'],
  Snoozed: ['#475467', '#F2F4F7', '◔'],
  'Expiring Soon': ['#B54708', '#FEF6E7', '⧗'],
  'Missing Evidence': ['#B42318', '#FEF3F2', '?'],
  'Acknowledgement Pending': ['#B54708', '#FEF6E7', '◷'],
  Acknowledged: ['#0E8442', '#ECFDF3', '✓'],
  Confirmed: ['#0E8442', '#ECFDF3', '✓'],
  'Needs Review': ['#B54708', '#FEF6E7', '?'],
  Normal: ['#475467', '#F2F4F7', '●'],
  Attention: ['#B54708', '#FEF6E7', '!'],
  'At Risk': ['#B42318', '#FEF3F2', '▲'],
  Public: ['#475467', '#F2F4F7', ''],
  Internal: ['#175CD3', '#EFF8FF', ''],
  Confidential: ['#B54708', '#FEF6E7', '🔒'],
  Restricted: ['#B42318', '#FEF3F2', '🔒'],
  'Legal Hold': ['#B42318', '#FEF3F2', '⚖'],
  Recorded: ['#475467', '#F2F4F7', '●'],
};

/** Contract lifecycle (contracts-core.js CT_T). */
export const CT_T: Record<string, string[]> = {
  Draft: ['Internal Review', 'Approval Required', 'Archived'],
  'Internal Review': ['Approval Required', 'Draft'],
  'Approval Required': ['Approved', 'Draft'],
  Approved: ['Signature Pending', 'Draft'],
  'Signature Pending': ['Partially Signed', 'Signed', 'Approved'],
  'Partially Signed': ['Signed', 'Approved'],
  Signed: ['Active'],
  Active: ['Expiring', 'Renewal Review', 'Terminated', 'Expired', 'Renewed'],
  Expiring: ['Renewal Review', 'Expired', 'Terminated', 'Renewed', 'Active'],
  'Renewal Review': ['Renewed', 'Expired', 'Terminated', 'Active', 'Expiring'],
  Expired: ['Archived', 'Renewal Review'],
  Terminated: ['Archived'],
  Renewed: ['Archived'],
  Archived: [],
};
export const LIVE = ['Active', 'Expiring', 'Renewal Review'];

export const TPL_POLICIES = [
  'None',
  'Owner',
  'Contract Manager → Finance → Owner',
  'HR → Owner',
  'Legal/Compliance → Owner',
];
export const RETENTIONS = [
  '7 years after expiry',
  '3 years',
  '10 years',
  'Permanent',
];
export const SIG_FIELDS = [
  'Signature',
  'Initial',
  'Date',
  'Name',
  'Text',
  'Checkbox',
];
export const FILE_TYPES = ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'TXT'];
export const CT_TYPES = [
  'Customer Agreement',
  'Service Agreement',
  'Supplier Agreement',
  'Vendor Contract',
  'NDA',
  'Employment Contract',
  'Partnership',
  'Lease',
  'Maintenance Agreement',
  'Subscription Agreement',
  'License',
  'Custom',
];
export const DOC_TYPES = [
  'Supplier Agreement',
  'Customer Agreement',
  'Service Agreement',
  'Employment Document',
  'Lease',
  'Policy',
  'License',
  'Certificate',
  'Insurance Proof',
  'Proposal',
  'Registration',
  'NDA',
  'Other',
];
export const TPL_TYPES = [
  'Contract',
  'Proposal',
  'Agreement',
  'NDA',
  'Service Agreement',
  'Employment Document',
  'Supplier Agreement',
  'Customer Agreement',
  'Policy',
  'Consent',
  'Form',
  'Certificate',
  'Custom',
];
export const CMP_TYPES = [
  'Policy',
  'License',
  'Certificate',
  'Insurance Proof',
  'Tax Evidence',
  'Registration',
  'Employee Policy',
  'Supplier Certificate',
  'Safety Document',
  'Data/Privacy Evidence',
  'Custom',
];
export const LINK_MODULES = [
  'Customers CRM',
  'Suppliers',
  'People & Payroll',
  'Assets & Maintenance',
  'Projects & Tasks',
  'Branches',
  'Finance & Accounting',
  'Field Service',
];
export const SENS = ['Public', 'Internal', 'Confidential', 'Restricted'];
export const SIGNER_ROLES = [
  'Business Signatory',
  'Customer',
  'Supplier',
  'Employee',
  'Witness',
  'Landlord',
  'Counterparty',
  'Custom',
];

/** Typed template variables (contracts-ui.js VARS) — nothing else is accepted in {{ }}. */
export const VARS: Record<string, string[]> = {
  Business: ['business.name', 'business.address', 'business.ntn'],
  Customer: [
    'customer.name',
    'customer.address',
    'customer.email',
    'customer.phone',
  ],
  Supplier: ['supplier.name', 'supplier.address', 'supplier.phone'],
  Counterparty: ['counterparty.name'],
  Staff: ['employee.name', 'role.title', 'salary.monthly'],
  Contract: [
    'contract.number',
    'contract.start_date',
    'contract.end_date',
    'contract.value',
    'contract.notice_days',
    'payment.terms',
    'credit.days',
    'nda.term_months',
    'deposit.percent',
    'event.date',
  ],
  Dates: ['today'],
  Policy: ['policy.title', 'policy.version'],
  Assets: ['asset.serial', 'warranty.end_date'],
};
export const ALL_VARS = Object.values(VARS).flat();

export const CT_SECS: [string, string, string][] = [
  [
    'numbering',
    'Document numbering',
    'Contract and document number formats — generated server-side, concurrency-safe.',
  ],
  ['files', 'File settings', 'Allowed types and sizes.'],
  ['folders', 'Folders', 'Default folder structure.'],
  ['retention', 'Retention', 'Retention, archive, deletion and legal hold.'],
  [
    'sensitivity',
    'Sensitivity',
    'What each label allows (view / download / share / export).',
  ],
  ['contract', 'Contract defaults', 'Owner, reminders and approval policy.'],
  [
    'esign',
    'eSign',
    'Built-in Noxtill eSign — signing links, order, reminders and expiry.',
  ],
  ['auth', 'Signer authentication', 'Allowed methods and OTP policy.'],
  ['approvals', 'Approvals', 'Approvers, thresholds and four-eyes control.'],
  ['notify', 'Notifications', 'Which events notify owners.'],
];

export interface CtConfig {
  numbering: {
    docPrefix: string;
    ctrPattern: string;
    reset: 'Never' | 'Yearly';
  };
  files: {
    types: string[];
    maxMb: number;
    perUpload: number;
    preview: boolean;
  };
  folders: { list: string[]; branchDefaults: boolean; moduleFolders: boolean };
  retention: { default: string; archive: string; deletion: string };
  sensitivity: Record<string, string>;
  contract: {
    ownerId: string | null;
    renewal: string[];
    notice: string[];
    retention: string;
    expiringDays: number;
  };
  esign: {
    methods: string[];
    order: 'Sequential' | 'Parallel';
    reminders: string;
    expiryDays: number;
  };
  auth: { methods: string[]; otpAbove: number; otpEmployees: boolean };
  approvals: {
    threshold: number;
    financeUserId: string | null;
    hrUserId: string | null;
    legalUserId: string | null;
    signatoryUserId: string | null;
    fourEyes: boolean;
    employmentHr: boolean;
    dueDays: number;
  };
  notify: {
    approval: boolean;
    signature: boolean;
    reminder: boolean;
    expiry: boolean;
    renewal: boolean;
    failed: boolean;
    ack: boolean;
  };
}

export const defaultCtConfig = (): CtConfig => ({
  numbering: {
    docPrefix: 'DOC-',
    ctrPattern: 'CTR-{YYYY}-{000000}',
    reset: 'Yearly',
  },
  files: {
    types: ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'TXT'],
    maxMb: 25,
    perUpload: 20,
    preview: true,
  },
  folders: {
    list: [
      'Contracts',
      'Suppliers',
      'Customers',
      'HR',
      'Compliance',
      'Projects',
      'Assets',
      'Finance',
    ],
    branchDefaults: true,
    moduleFolders: true,
  },
  retention: {
    default: '7 years after expiry',
    archive: 'Archive when expired',
    deletion: 'Owner approval after retention ends',
  },
  sensitivity: {
    Public: 'Anyone internal · downloadable',
    Internal: 'All staff · downloadable',
    Confidential: 'Owners of record + managers · download logged',
    Restricted: 'Named roles only · no export',
  },
  contract: {
    ownerId: null,
    renewal: ['90 days', '60 days', '30 days'],
    notice: ['14 days', '7 days', '1 day'],
    retention: '7 years after expiry',
    expiringDays: 30,
  },
  esign: {
    methods: ['Typed', 'Drawn'],
    order: 'Sequential',
    reminders: 'Every 3 days',
    expiryDays: 14,
  },
  auth: {
    methods: ['Email', 'Email + OTP'],
    otpAbove: 500000,
    otpEmployees: true,
  },
  approvals: {
    threshold: 5000000,
    financeUserId: null,
    hrUserId: null,
    legalUserId: null,
    signatoryUserId: null,
    fourEyes: true,
    employmentHr: true,
    dueDays: 3,
  },
  notify: {
    approval: true,
    signature: true,
    reminder: true,
    expiry: true,
    renewal: true,
    failed: true,
    ack: true,
  },
});

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function mergeCtConfig(saved: unknown): CtConfig {
  const d = defaultCtConfig() as unknown as Record<string, unknown>;
  if (!isObj(saved)) return d as unknown as CtConfig;
  const out: Record<string, unknown> = { ...d };
  for (const [k, v] of Object.entries(saved))
    if (isObj(d[k]) && isObj(v)) out[k] = { ...d[k], ...v };
    else if (v !== undefined) out[k] = v;
  return out as unknown as CtConfig;
}

/** `CTR-{YYYY}-{000000}` + year 2026 + 124 → `CTR-2026-000124`. */
export function ctrNumber(pattern: string, year: number, n: number) {
  const m = /\{(0+)\}/.exec(pattern);
  const p = pattern.replace('{YYYY}', String(year));
  return m ? p.replace(m[0], String(n).padStart(m[1].length, '0')) : `${p}${n}`;
}

/** Days from a reminder label ("90 days" → 90). */
export const daysOf = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? 0);
export const REMIND_DAYS: Record<string, number> = {
  Daily: 1,
  'Every 3 days': 3,
  Weekly: 7,
  Off: 0,
};
