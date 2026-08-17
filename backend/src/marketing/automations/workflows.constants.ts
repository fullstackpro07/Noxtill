export const WORKFLOW_ERROR_CODES = {
  NOT_FOUND: 'workflow.not_found',
} as const;

/** Same pass-through-body pattern as `campaign`/`voucher_issued` — the body is caller-supplied. */
export const AUTOMATION_MESSAGE_TEMPLATE_KEY = 'automation_message';

export const CREDIT_OVERDUE_SCAN_QUEUE = 'credit-overdue-scan';
