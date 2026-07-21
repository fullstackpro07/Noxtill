import { AppointmentStatus } from '../../generated/prisma';
export declare const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]>;
export declare const BOOKING_ERROR_CODES: {
    readonly SERVICE_NOT_FOUND: "BOOKING_SERVICE_NOT_FOUND";
    readonly SLOT_UNAVAILABLE: "BOOKING_SLOT_UNAVAILABLE";
    readonly INVALID_STATUS_TRANSITION: "BOOKING_INVALID_STATUS_TRANSITION";
};
