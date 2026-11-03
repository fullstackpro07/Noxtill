import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { localDateKey } from './booking-policy.util';
import { BOOKING_ERROR_CODES } from './bookings.constants';
import { computeAvailableSlots } from './working-hours.util';

/** Shared phone create/change validation; never infer hours or service duration. */
export function assertPhoneBookingSlot(
  business: { workingHours: unknown; timezone: string },
  startsAt: Date,
  durationMin: number,
): void {
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) {
    throw new AppException(
      'INVALID_BOOKING_TIME',
      'Choose a future booking time',
    );
  }
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    throw new AppException(
      'INVALID_SERVICE_DURATION',
      'This service has no valid booking duration. Contact staff.',
    );
  }
  const slots = computeAvailableSlots({
    workingHours: business.workingHours ?? {},
    timezone: business.timezone,
    date: localDateKey(startsAt, business.timezone),
    durationMin,
    busyIntervals: [], // The canonical transaction checks conflicts and service buffers.
  });
  if (!slots.some((slot) => slot.getTime() === startsAt.getTime())) {
    throw new AppException(
      BOOKING_ERROR_CODES.SLOT_UNAVAILABLE,
      'That time is outside the configured booking slots or business hours',
      HttpStatus.CONFLICT,
    );
  }
}
