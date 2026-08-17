export const BRANCH_ROLLUP_DEFAULT_DAYS = 30;
export const BRANCH_COMPARE_DEFAULT_WEEKS = 12;

export const BRANCH_ERROR_CODES = {
  IDENTITY_REQUIRED: 'BRANCH_IDENTITY_REQUIRED',
} as const;

/** Same rationale as `staff.constants.ts`'s `TEMP_PASSWORD_BYTES` — a human-relayed, single-use credential. */
export const BRANCH_TEMP_PASSWORD_BYTES = 8;
