export const CREDIT_ERROR_CODES = {
  PLAN_AMOUNT_MISMATCH: 'credit.plan_amount_mismatch',
  INSTALLMENT_NOT_FOUND: 'credit.installment_not_found',
  INSTALLMENT_NOT_PENDING: 'credit.installment_not_pending',
  WRITE_OFF_EXCEEDS_BALANCE: 'credit.write_off_exceeds_balance',
  WRITE_OFF_CONFIRMATION_MISMATCH: 'credit.write_off_confirmation_mismatch',
  SHARE_LINK_REVOKED: 'credit.share_link_revoked',
  REMINDER_RULE_NOT_FOUND: 'credit.reminder_rule_not_found',
  TEST_SEND_TARGET_REQUIRED: 'credit.test_send_target_required',
} as const;

/** Typed-confirmation gate for the (irreversible) write-off action — the caller must send this exact phrase. */
export const WRITE_OFF_CONFIRM_PHRASE = 'WRITE OFF';

/**
 * Overdue ageing (UPD-BE-094) — the bucket boundaries the Overdue screen's cards/chart use, and
 * the "at-risk" definition: 90+ days overdue with no repayment plan in place (a real, computed
 * signal — not a fabricated risk score).
 */
export const OVERDUE_BUCKETS = [
  { key: 'current', min: 0, max: 29 },
  { key: 'thirtyPlus', min: 30, max: 59 },
  { key: 'sixtyPlus', min: 60, max: 89 },
  { key: 'ninetyPlus', min: 90, max: Infinity },
] as const;

/** Credit reminder rules (UPD-BE-095) — which pre-approved template each tone falls back to for
 * WhatsApp sends outside its 24h window (see `ReminderRule`/`ReminderRulesService` for the same
 * real-vs-pre-approved split this mirrors). */
export const CREDIT_REMINDER_TONE_TEMPLATE_KEYS: Record<
  'gentle' | 'firm' | 'final',
  string
> = {
  gentle: 'credit_reminder',
  firm: 'credit_reminder_firm',
  final: 'credit_reminder_final',
};
