export const CRM_JOBS_QUEUE = 'crm-jobs';

/** No configurable per-business threshold exists yet, so these are documented defaults (BE-041). */
export const VIP_LIFETIME_SPEND_THRESHOLD = 500;
export const LAPSED_DAYS = 60;
export const TAG_RULES_LOCAL_HOUR = '00'; // nightly, per business timezone
export const BIRTHDAY_LOCAL_HOUR = '09'; // daily, per business timezone

/** Membership depth fix (UPD-INT-007) — a cash membership has no gateway to auto-charge, so once
 * its real due date passes with no renewal recorded, it's honestly marked expired rather than
 * silently staying "active" forever with no indication a payment was ever due. */
export const MEMBERSHIP_EXPIRY_QUEUE_NAME = 'membership-expiry-tick';
