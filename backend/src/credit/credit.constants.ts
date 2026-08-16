export const CREDIT_ERROR_CODES = {
  PLAN_AMOUNT_MISMATCH: 'credit.plan_amount_mismatch',
  INSTALLMENT_NOT_FOUND: 'credit.installment_not_found',
  INSTALLMENT_NOT_PENDING: 'credit.installment_not_pending',
  WRITE_OFF_EXCEEDS_BALANCE: 'credit.write_off_exceeds_balance',
  WRITE_OFF_CONFIRMATION_MISMATCH: 'credit.write_off_confirmation_mismatch',
  SHARE_LINK_REVOKED: 'credit.share_link_revoked',
} as const;

/** Typed-confirmation gate for the (irreversible) write-off action — the caller must send this exact phrase. */
export const WRITE_OFF_CONFIRM_PHRASE = 'WRITE OFF';
