import { parseExpression } from 'cron-parser';
import {
  MAX_WORKFLOW_SCHEDULE_MINUTES,
  MIN_WORKFLOW_SCHEDULE_MINUTES,
} from './workflows.constants';

const CRON_FIELD_COUNT = 5;
const MAX_CRON_EXPRESSION_LENGTH = 100;
const MAX_TIMEZONE_LENGTH = 64;

export function validateScheduleConfiguration(
  scheduleEveryMinutes: unknown,
  cronExpression: unknown,
  timezone: unknown,
): string | null {
  const hasInterval =
    scheduleEveryMinutes !== undefined && scheduleEveryMinutes !== null;
  const hasCron = cronExpression !== undefined && cronExpression !== null;
  if (hasInterval === hasCron) {
    return 'Choose exactly one scheduled interval or cron expression.';
  }
  if (hasCron) return validateCronSchedule(cronExpression, timezone);
  if (
    typeof scheduleEveryMinutes !== 'number' ||
    !Number.isInteger(scheduleEveryMinutes) ||
    scheduleEveryMinutes < MIN_WORKFLOW_SCHEDULE_MINUTES ||
    scheduleEveryMinutes > MAX_WORKFLOW_SCHEDULE_MINUTES
  ) {
    return `Scheduled workflows need an interval between ${MIN_WORKFLOW_SCHEDULE_MINUTES} minutes and ${MAX_WORKFLOW_SCHEDULE_MINUTES} minutes, or a valid five-field cron expression.`;
  }
  return null;
}

export function validateCronSchedule(
  expression: unknown,
  timezone: unknown,
): string | null {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    return 'A cron expression is required.';
  }
  const normalizedExpression = expression.trim();
  if (normalizedExpression.length > MAX_CRON_EXPRESSION_LENGTH) {
    return `Cron expressions must be ${MAX_CRON_EXPRESSION_LENGTH} characters or fewer.`;
  }
  if (normalizedExpression.split(/\s+/).length !== CRON_FIELD_COUNT) {
    return 'Use a five-field cron expression: minute hour day-of-month month day-of-week.';
  }
  if (
    typeof timezone !== 'string' ||
    timezone.trim().length === 0 ||
    timezone.trim().length > MAX_TIMEZONE_LENGTH
  ) {
    return `Enter a valid IANA time zone of ${MAX_TIMEZONE_LENGTH} characters or fewer.`;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
    parseExpression(normalizedExpression, {
      currentDate: new Date(),
      tz: timezone.trim(),
    }).next();
    return null;
  } catch {
    return 'The cron expression or IANA time zone is invalid.';
  }
}

/** Returns the first matching occurrence strictly after `after`, interpreted in the IANA zone. */
export function nextCronOccurrence(
  expression: string,
  timezone: string,
  after: Date,
): Date {
  const validationError = validateCronSchedule(expression, timezone);
  if (validationError) throw new Error(validationError);
  return parseExpression(expression.trim(), {
    currentDate: after,
    tz: timezone.trim(),
  })
    .next()
    .toDate();
}
