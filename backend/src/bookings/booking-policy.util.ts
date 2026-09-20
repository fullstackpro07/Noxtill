import { HttpStatus } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { ResolvedPolicies } from '../common/policies/policies.service';
import { BOOKING_ERROR_CODES } from './bookings.constants';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The calendar day (YYYY-MM-DD) `d` falls on in the business's own timezone. */
export function localDateKey(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Whether a start time is inside the owner's booking window (minimum notice / furthest ahead). */
export function windowViolation(policies: ResolvedPolicies, startsAt: Date, now: Date): 'too_soon' | 'too_far' | null {
  const minHours = policies.num('bookings.minAdvanceHours');
  if (minHours !== null && startsAt.getTime() < now.getTime() + minHours * HOUR_MS) return 'too_soon';
  const maxDays = policies.num('bookings.maxAdvanceDays');
  if (maxDays !== null && startsAt.getTime() > now.getTime() + maxDays * DAY_MS) return 'too_far';
  return null;
}

export function assertBookingWindow(policies: ResolvedPolicies, startsAt: Date, now: Date): void {
  const v = windowViolation(policies, startsAt, now);
  if (v === 'too_soon') {
    throw new AppException(
      BOOKING_ERROR_CODES.TOO_SOON,
      `Bookings need at least ${policies.num('bookings.minAdvanceHours')} hour(s) notice`,
      HttpStatus.BAD_REQUEST,
    );
  }
  if (v === 'too_far') {
    throw new AppException(
      BOOKING_ERROR_CODES.TOO_FAR,
      `Bookings can only be made up to ${policies.num('bookings.maxAdvanceDays')} day(s) ahead`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** A customer may cancel or move a booking only until the owner's cut-off before it starts. */
export function assertChangeWindow(policies: ResolvedPolicies, kind: 'cancel' | 'reschedule', startsAt: Date, now: Date): void {
  const hours = policies.num(kind === 'cancel' ? 'bookings.cancellationWindowHours' : 'bookings.rescheduleWindowHours');
  if (hours === null) return;
  if (startsAt.getTime() - now.getTime() < hours * HOUR_MS) {
    throw new AppException(
      BOOKING_ERROR_CODES.CHANGE_WINDOW_CLOSED,
      `Bookings can only be ${kind === 'cancel' ? 'cancelled' : 'rescheduled'} up to ${hours} hour(s) before they start — please contact the business`,
      HttpStatus.FORBIDDEN,
    );
  }
}

interface AppointmentCounter {
  appointment: {
    findMany(args: {
      where: { businessId: string; status: { notIn: AppointmentStatus[] }; startsAt: { gte: Date; lt: Date }; id?: { not: string } };
      select: { startsAt: true };
    }): Promise<{ startsAt: Date }[]>;
  };
}

/** Live (not cancelled) bookings on the same local day as `day`, optionally ignoring one booking. */
export async function countBookingsOnDay(
  db: AppointmentCounter,
  businessId: string,
  day: Date,
  timezone: string,
  excludeId?: string,
): Promise<number> {
  const key = localDateKey(day, timezone);
  const rows = await db.appointment.findMany({
    where: {
      businessId,
      status: { notIn: [AppointmentStatus.cancelled] },
      startsAt: { gte: new Date(day.getTime() - 36 * HOUR_MS), lt: new Date(day.getTime() + 36 * HOUR_MS) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startsAt: true },
  });
  return rows.filter((r) => localDateKey(r.startsAt, timezone) === key).length;
}

export async function assertDayNotFull(
  db: AppointmentCounter,
  policies: ResolvedPolicies,
  businessId: string,
  day: Date,
  timezone: string,
  excludeId?: string,
): Promise<void> {
  const max = policies.num('bookings.maxDailyBookings');
  if (max === null) return;
  if ((await countBookingsOnDay(db, businessId, day, timezone, excludeId)) >= max) {
    throw new AppException(BOOKING_ERROR_CODES.DAY_FULL, 'That day is fully booked — please choose another day', HttpStatus.CONFLICT);
  }
}
