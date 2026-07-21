export const REVIEW_REMINDERS_QUEUE = 'review-reminders';

/** Reminders fire at day 3 and day 7 after the original request; never more than 2 total (spec §4.1). */
export const REVIEW_REMINDER_DAY_OFFSETS = [3, 7];
export const REVIEW_REMINDER_MAX_COUNT = REVIEW_REMINDER_DAY_OFFSETS.length;

/** Same hourly-tick-checks-local-time pattern as Nightly Close / CRM jobs. */
export const REVIEW_REMINDERS_LOCAL_HOUR = '10';
