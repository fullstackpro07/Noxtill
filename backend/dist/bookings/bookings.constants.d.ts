import { AppointmentStatus } from '../../generated/prisma';
export declare const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]>;
export declare const BOOKING_ERROR_CODES: {
    readonly SERVICE_NOT_FOUND: "BOOKING_SERVICE_NOT_FOUND";
    readonly SLOT_UNAVAILABLE: "BOOKING_SLOT_UNAVAILABLE";
    readonly INVALID_STATUS_TRANSITION: "BOOKING_INVALID_STATUS_TRANSITION";
    readonly NOT_REQUESTED: "BOOKING_NOT_REQUESTED";
};
export declare const WAITLIST_ERROR_CODES: {
    readonly ENTRY_NOT_FOUND: "waitlist.entry_not_found";
    readonly NOT_WAITING: "waitlist.not_waiting";
    readonly NOT_OFFERED: "waitlist.not_offered";
};
export declare const QUEUE_ERROR_CODES: {
    readonly TOKEN_NOT_FOUND: "queue.token_not_found";
    readonly INVALID_TRANSITION: "queue.invalid_transition";
};
export declare const DEPOSIT_ERROR_CODES: {
    readonly DEPOSIT_NOT_FOUND: "deposit.not_found";
    readonly NOT_PENDING: "deposit.not_pending";
    readonly NOT_CAPTURED: "deposit.not_captured";
    readonly ONLINE_CAPTURE_NOT_SUPPORTED: "deposit.online_capture_not_supported";
};
export declare const WAITLIST_OFFER_HOLD_HOURS = 24;
