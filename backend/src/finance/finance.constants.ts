export const FINANCE_QUEUE = 'finance';

export const FIN_ERRORS = {
  NOT_FOUND: 'FINANCE_NOT_FOUND',
  FORBIDDEN: 'FINANCE_FORBIDDEN',
  INVALID: 'FINANCE_INVALID',
  CONFLICT: 'FINANCE_CONFLICT',
  PERIOD_LOCKED: 'FINANCE_PERIOD_LOCKED',
  UNBALANCED: 'FINANCE_UNBALANCED',
  FX_MISSING: 'FINANCE_FX_RATE_MISSING',
  SOD: 'FINANCE_SEGREGATION_OF_DUTIES',
  VERSION: 'FINANCE_VERSION_CONFLICT',
} as const;

/** Stored account types → the label the design shows. */
export const ACCOUNT_TYPES: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  cos: 'Cost of Sales',
  expense: 'Expense',
  other_inc: 'Other Income',
  other_exp: 'Other Expense',
};
export const TYPE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ACCOUNT_TYPES).map(([k, v]) => [v, k]),
);
/** Natural debit-balance types. Contra accounts (accumulated depreciation, returns) keep their type's side. */
export const DEBIT_NATURE = new Set(['asset', 'cos', 'expense', 'other_exp']);
export const PL_TYPES = new Set([
  'revenue',
  'cos',
  'expense',
  'other_inc',
  'other_exp',
]);

export const CONTROL_LABEL: Record<string, string> = {
  ar: 'Accounts receivable',
  ap: 'Accounts payable',
  fa: 'Fixed assets',
  tax: 'Tax',
  inventory: 'Inventory',
};

/**
 * The chart every business starts with. Codes follow the Finance design; systemKey is what the
 * posting rules resolve, so an owner can rename or renumber an account without breaking postings.
 * [code, name, type, subtype, parentCode, control, systemKey, reconcilable, header]
 */
type Seed = [
  string,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
  boolean,
  boolean,
];
/** System accounts added after ledgers were first seeded; created on demand for existing ledgers. */
export const LATE_SYSTEM_KEYS = ['repairs'];
export const COA_TEMPLATE: Seed[] = [
  ['1000', 'Assets', 'asset', 'Header', null, null, null, false, true],
  ['1100', 'Cash & Bank', 'asset', 'Header', '1000', null, null, false, true],
  [
    '1120',
    'Cash on Hand',
    'asset',
    'Cash',
    '1100',
    null,
    'cash_drawer',
    true,
    false,
  ],
  [
    '1150',
    'Payment Clearing',
    'asset',
    'Clearing',
    '1000',
    null,
    'clearing',
    true,
    false,
  ],
  [
    '1200',
    'Accounts Receivable',
    'asset',
    'Receivable',
    '1000',
    'ar',
    'ar',
    false,
    false,
  ],
  [
    '1300',
    'Inventory',
    'asset',
    'Inventory',
    '1000',
    'inventory',
    'inventory',
    false,
    false,
  ],
  [
    '1310',
    'Inventory in Transit',
    'asset',
    'Inventory',
    '1000',
    null,
    'inventory_transit',
    false,
    false,
  ],
  [
    '1400',
    'Prepaid Expenses',
    'asset',
    'Current Asset',
    '1000',
    null,
    'prepaid',
    false,
    false,
  ],
  [
    '1500',
    'Fixed Assets — Cost',
    'asset',
    'Fixed Asset',
    '1000',
    'fa',
    'fa_cost',
    false,
    false,
  ],
  [
    '1590',
    'Accumulated Depreciation',
    'asset',
    'Contra Asset',
    '1000',
    'fa',
    'fa_accum',
    false,
    false,
  ],
  [
    '1999',
    'Suspense',
    'asset',
    'Suspense',
    '1000',
    null,
    'suspense',
    false,
    false,
  ],
  ['2000', 'Liabilities', 'liability', 'Header', null, null, null, false, true],
  [
    '2100',
    'Accounts Payable',
    'liability',
    'Payable',
    '2000',
    'ap',
    'ap',
    false,
    false,
  ],
  [
    '2150',
    'Goods Received Not Invoiced',
    'liability',
    'Current Liability',
    '2000',
    null,
    'grni',
    false,
    false,
  ],
  [
    '2200',
    'Tax Payable',
    'liability',
    'Tax',
    '2000',
    'tax',
    'output_tax',
    false,
    false,
  ],
  [
    '2210',
    'Input Tax Recoverable',
    'liability',
    'Tax',
    '2000',
    'tax',
    'input_tax',
    false,
    false,
  ],
  [
    '2300',
    'Accrued Expenses',
    'liability',
    'Current Liability',
    '2000',
    null,
    'accrued',
    false,
    false,
  ],
  [
    '2350',
    'Customer Deposits',
    'liability',
    'Current Liability',
    '2000',
    null,
    'deposits',
    false,
    false,
  ],
  [
    '2360',
    'Vouchers Outstanding',
    'liability',
    'Current Liability',
    '2000',
    null,
    'vouchers',
    false,
    false,
  ],
  [
    '2400',
    'Payroll Liabilities',
    'liability',
    'Current Liability',
    '2000',
    null,
    'payroll_liab',
    false,
    false,
  ],
  [
    '2450',
    'Income Tax Payable',
    'liability',
    'Tax',
    '2000',
    null,
    'income_tax_payable',
    false,
    false,
  ],
  [
    '2500',
    'Loans',
    'liability',
    'Long-term Liability',
    '2000',
    null,
    null,
    false,
    false,
  ],
  ['3000', 'Equity', 'equity', 'Header', null, null, null, false, true],
  [
    '3100',
    "Owner's Capital",
    'equity',
    'Capital',
    '3000',
    null,
    'capital',
    false,
    false,
  ],
  [
    '3150',
    'Opening Balance Equity',
    'equity',
    'Capital',
    '3000',
    null,
    'opening_equity',
    false,
    false,
  ],
  [
    '3200',
    'Retained Earnings',
    'equity',
    'Retained Earnings',
    '3000',
    null,
    'retained',
    false,
    false,
  ],
  [
    '3300',
    'Owner Drawings',
    'equity',
    'Drawings',
    '3000',
    null,
    'drawings',
    false,
    false,
  ],
  ['4000', 'Revenue', 'revenue', 'Header', null, null, null, false, true],
  [
    '4100',
    'Product Sales',
    'revenue',
    'Sales',
    '4000',
    null,
    'sales',
    false,
    false,
  ],
  [
    '4200',
    'Service Revenue',
    'revenue',
    'Sales',
    '4000',
    null,
    'service_sales',
    false,
    false,
  ],
  [
    '4900',
    'Sales Returns',
    'revenue',
    'Contra Revenue',
    '4000',
    null,
    'sales_returns',
    false,
    false,
  ],
  ['5000', 'Cost of Sales', 'cos', 'Header', null, null, null, false, true],
  [
    '5100',
    'Cost of Goods Sold',
    'cos',
    'COGS',
    '5000',
    null,
    'cogs',
    false,
    false,
  ],
  [
    '5150',
    'Inventory Shrinkage & Wastage',
    'cos',
    'COGS',
    '5000',
    null,
    'shrinkage',
    false,
    false,
  ],
  ['6000', 'Expenses', 'expense', 'Header', null, null, null, false, true],
  [
    '6100',
    'Rent Expense',
    'expense',
    'Occupancy',
    '6000',
    null,
    'rent',
    false,
    false,
  ],
  [
    '6200',
    'Salaries & Wages',
    'expense',
    'Payroll',
    '6000',
    null,
    'salaries',
    false,
    false,
  ],
  [
    '6300',
    'Marketing',
    'expense',
    'Sales & Marketing',
    '6000',
    null,
    'marketing',
    false,
    false,
  ],
  [
    '6400',
    'Utilities',
    'expense',
    'Occupancy',
    '6000',
    null,
    'utilities',
    false,
    false,
  ],
  [
    '6450',
    'Repairs & Maintenance',
    'expense',
    'Occupancy',
    '6000',
    null,
    'repairs',
    false,
    false,
  ],
  [
    '6500',
    'Bank Fees',
    'expense',
    'Finance Costs',
    '6000',
    null,
    'bank_fees',
    false,
    false,
  ],
  [
    '6600',
    'Bad Debts',
    'expense',
    'Admin',
    '6000',
    null,
    'bad_debt',
    false,
    false,
  ],
  [
    '6700',
    'Cash Over / Short',
    'expense',
    'Admin',
    '6000',
    null,
    'cash_short',
    false,
    false,
  ],
  [
    '6800',
    'General & Administrative',
    'expense',
    'Admin',
    '6000',
    null,
    'general',
    false,
    false,
  ],
  [
    '6900',
    'Depreciation Expense',
    'expense',
    'Depreciation',
    '6000',
    null,
    'depreciation',
    false,
    false,
  ],
  [
    '7000',
    'Other Income',
    'other_inc',
    'Header',
    null,
    null,
    null,
    false,
    true,
  ],
  [
    '7100',
    'FX Gain / Loss',
    'other_inc',
    'FX',
    '7000',
    null,
    'fx',
    false,
    false,
  ],
  [
    '7200',
    'Interest Income',
    'other_inc',
    'Interest',
    '7000',
    null,
    null,
    false,
    false,
  ],
  [
    '7300',
    'Forfeited Deposits',
    'other_inc',
    'Other',
    '7000',
    null,
    'forfeit_income',
    false,
    false,
  ],
  [
    '7400',
    'Gain / Loss on Disposal',
    'other_inc',
    'Other',
    '7000',
    null,
    'disposal',
    false,
    false,
  ],
  ['8000', 'Income Tax', 'other_exp', 'Header', null, null, null, false, true],
  [
    '8100',
    'Income Tax Expense',
    'other_exp',
    'Tax Expense',
    '8000',
    null,
    null,
    false,
    false,
  ],
];

/** Expense categories (free text in Expenses) → account, by keyword, until an owner maps them. */
export const EXPENSE_KEYWORDS: [RegExp, string][] = [
  [/rent|lease/i, 'rent'],
  [/salar|wage|payroll|staff pay/i, 'salaries'],
  [/market|advert|ads\b|promo/i, 'marketing'],
  [/utilit|electric|water|gas\b|internet|power|phone/i, 'utilities'],
  [/bank|fee/i, 'bank_fees'],
];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface FinanceConfig {
  profile: {
    fyStart: string;
    method: string;
    branchMode: string;
    rounding: string;
  };
  posting: {
    softClose: boolean;
    softCloseDays: number;
    reqDept: boolean;
    dupBill: boolean;
    autoRev: boolean;
  };
  thresholds: {
    journalDirect: number;
    journalOwner: number;
    billOwner: number;
  };
  sod: { sod1: boolean; sod2: boolean; sod3: boolean; sod4: boolean };
  close: { reqEvidence: boolean; lockAfter: boolean; closeDay: string };
  /** Account code expenses are credited to (how they were paid). */
  expensePaidFrom: string;
  /** Expense category (lower-cased) → account code. */
  expenseMap: Record<string, string>;
  /** Days after a sale an unpaid balance is due — Noxtill invoices carry no due date of their own. */
  arTermsDays: number;
  departments: string[];
  /** Material budget variance: both conditions must hold. */
  materialPct: number;
  materialAmt: number;
}

export function defaultConfig(): FinanceConfig {
  return {
    profile: {
      fyStart: 'January',
      method: 'Accrual',
      branchMode: 'Optional',
      rounding: 'Round per line (2 dp)',
    },
    posting: {
      softClose: true,
      softCloseDays: 5,
      reqDept: false,
      dupBill: true,
      autoRev: false,
    },
    thresholds: { journalDirect: 1000, journalOwner: 10000, billOwner: 5000 },
    sod: { sod1: true, sod2: true, sod3: true, sod4: true },
    close: {
      reqEvidence: true,
      lockAfter: true,
      closeDay: '5th business day',
    },
    expensePaidFrom: '1120',
    expenseMap: {},
    arTermsDays: 0,
    departments: [],
    materialPct: 10,
    materialAmt: 250,
  };
}

export function mergeConfig(raw: unknown): FinanceConfig {
  const d = defaultConfig();
  const r = (raw ?? {}) as Partial<FinanceConfig>;
  return {
    ...d,
    ...r,
    profile: { ...d.profile, ...(r.profile ?? {}) },
    posting: { ...d.posting, ...(r.posting ?? {}) },
    thresholds: { ...d.thresholds, ...(r.thresholds ?? {}) },
    sod: { ...d.sod, ...(r.sod ?? {}) },
    close: { ...d.close, ...(r.close ?? {}) },
    expenseMap: { ...(r.expenseMap ?? {}) },
    departments: Array.isArray(r.departments) ? r.departments : [],
  };
}

export const JOURNAL_STATUSES = [
  'Draft',
  'Pending Review',
  'Approval Required',
  'Ready to Post',
  'Posted',
  'Reversed',
  'Failed',
  'Voided',
] as const;
export const MANUAL_TYPES = ['Adjustment', 'Accrual', 'Prepayment', 'Reclass'];

/** Close checklist template — each task's status is derived from real checks where one exists. */
export const CLOSE_TEMPLATE: [string, string, string, string][] = [
  ['CL-01', 'Bank accounts reconciled', 'Banking', 'recon'],
  ['CL-02', 'A/R reviewed', 'Receivables', 'ar'],
  ['CL-03', 'A/P reviewed', 'Payables', 'ap'],
  ['CL-04', 'Bills posted', 'Payables', 'bills'],
  ['CL-05', 'Accruals posted', 'Journals', 'journals'],
  ['CL-06', 'Prepayments reviewed', 'Journals', 'coa'],
  ['CL-07', 'Depreciation posted', 'Fixed assets', 'fa'],
  ['CL-08', 'Inventory cut-off checked', 'Cut-off', 'cutoff'],
  ['CL-09', 'Payments cut-off checked', 'Cut-off', 'cutoff'],
  ['CL-10', 'Procurement cut-off checked', 'Cut-off', 'cutoff'],
  ['CL-11', 'Taxes reviewed', 'Tax', 'taxes'],
  ['CL-12', 'Suspense accounts reviewed', 'Journals', 'journals'],
  ['CL-13', 'Intercompany checked', 'Group', ''],
  ['CL-14', 'FX revaluation', 'FX', 'gl'],
  ['CL-15', 'Financial statements reviewed', 'Reporting', 'statements'],
];

export const ASSET_CATEGORIES = [
  'Leasehold Improvements',
  'Vehicles',
  'Equipment',
  'Furniture & Fixtures',
  'IT Equipment',
  'Buildings',
  'Other',
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
];
