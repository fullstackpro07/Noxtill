import { AppointmentStatus } from '../../generated/prisma';

/** Valid forward transitions (same flow-guard pattern as ORDER_STATUS_TRANSITIONS). */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  booked: [
    AppointmentStatus.confirmed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  confirmed: [
    AppointmentStatus.completed,
    AppointmentStatus.cancelled,
    AppointmentStatus.no_show,
  ],
  completed: [],
  no_show: [],
  cancelled: [],
};

export const BOOKING_ERROR_CODES = {
  SERVICE_NOT_FOUND: 'BOOKING_SERVICE_NOT_FOUND',
  SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
} as const;
