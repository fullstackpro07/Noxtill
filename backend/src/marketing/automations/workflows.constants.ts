export const WORKFLOW_ERROR_CODES = {
  NOT_FOUND: 'workflow.not_found',
  TEMPLATE_NOT_FOUND: 'workflow.template_not_found',
  ARCHIVED: 'workflow.archived',
  INVALID_DEFINITION: 'workflow.invalid_definition',
  VERSION_CONFLICT: 'workflow.version_conflict',
  VERSION_NOT_FOUND: 'workflow.version_not_found',
  VERSION_RESTORE_NOT_ALLOWED: 'workflow.version_restore_not_allowed',
  VERSION_RESTORE_REASON_REQUIRED: 'workflow.version_restore_reason_required',
  RUN_NOT_FOUND: 'workflow.run_not_found',
  RETRY_NOT_ALLOWED: 'workflow.retry_not_allowed',
  RETRY_LIMIT_REACHED: 'workflow.retry_limit_reached',
  CANCEL_NOT_ALLOWED: 'workflow.cancel_not_allowed',
  CUSTOMER_TAG_TARGET_NOT_FOUND: 'workflow.customer_tag_target_not_found',
  CUSTOMER_TAG_DATA_INVALID: 'workflow.customer_tag_data_invalid',
  CUSTOMER_CUSTOM_FIELD_TARGET_NOT_FOUND:
    'workflow.customer_custom_field_target_not_found',
  CUSTOMER_CUSTOM_FIELD_INVALID: 'workflow.customer_custom_field_invalid',
  CUSTOMER_CUSTOM_FIELD_DATA_INVALID:
    'workflow.customer_custom_field_data_invalid',
  APPROVAL_NOT_FOUND: 'workflow.approval_not_found',
  APPROVAL_DECISION_NOT_ALLOWED: 'workflow.approval_decision_not_allowed',
  APPROVAL_PAYLOAD_CHANGED: 'workflow.approval_payload_changed',
  APPROVAL_ROLE_REQUIRED: 'workflow.approval_role_required',
  INVALID_RUN_QUERY: 'workflow.invalid_run_query',
  DEAD_LETTER_NOT_FOUND: 'workflow.dead_letter_not_found',
  DEAD_LETTER_DECISION_NOT_ALLOWED: 'workflow.dead_letter_decision_not_allowed',
  DEAD_LETTER_RETRY_NOT_ALLOWED: 'workflow.dead_letter_retry_not_allowed',
} as const;

export const WORKFLOW_VARIABLE_ERROR_CODES = {
  NOT_FOUND: 'workflow.variable_not_found',
  DUPLICATE: 'workflow.variable_duplicate',
  INVALID_VALUE: 'workflow.variable_invalid_value',
  INVALID_SCOPE: 'workflow.variable_invalid_scope',
  LIMIT_REACHED: 'workflow.variable_limit_reached',
} as const;

export const MAX_WORKFLOW_RETRIES = 2;
export const MAX_DEAD_LETTER_OPERATOR_RETRIES = 1;

export const MIN_WORKFLOW_SCHEDULE_MINUTES = 15;
export const MAX_WORKFLOW_SCHEDULE_MINUTES = 10_080;
export const MAX_WORKFLOW_WAIT_MINUTES = 10_080;
export const MAX_WORKFLOW_AI_DRAFT_PROMPT_LENGTH = 4_000;
export const MAX_WORKFLOW_AI_DRAFT_OUTPUT_TOKENS = 512;

/** Same pass-through-body pattern as `campaign`/`voucher_issued` — the body is caller-supplied. */
export const AUTOMATION_MESSAGE_TEMPLATE_KEY = 'automation_message';

export const CREDIT_OVERDUE_SCAN_QUEUE = 'credit-overdue-scan';

export const WORKFLOW_SCHEDULE_QUEUE = 'workflow-schedule';
