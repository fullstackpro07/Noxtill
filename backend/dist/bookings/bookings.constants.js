"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WAITLIST_OFFER_HOLD_HOURS = exports.DEPOSIT_ERROR_CODES = exports.QUEUE_ERROR_CODES = exports.WAITLIST_ERROR_CODES = exports.BOOKING_ERROR_CODES = exports.APPOINTMENT_STATUS_TRANSITIONS = void 0;
const prisma_1 = require("../../generated/prisma");
exports.APPOINTMENT_STATUS_TRANSITIONS = {
    requested: [prisma_1.AppointmentStatus.confirmed, prisma_1.AppointmentStatus.cancelled],
    booked: [
        prisma_1.AppointmentStatus.confirmed,
        prisma_1.AppointmentStatus.cancelled,
        prisma_1.AppointmentStatus.no_show,
    ],
    confirmed: [
        prisma_1.AppointmentStatus.completed,
        prisma_1.AppointmentStatus.cancelled,
        prisma_1.AppointmentStatus.no_show,
    ],
    completed: [],
    no_show: [],
    cancelled: [],
};
exports.BOOKING_ERROR_CODES = {
    SERVICE_NOT_FOUND: 'BOOKING_SERVICE_NOT_FOUND',
    SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
    INVALID_STATUS_TRANSITION: 'BOOKING_INVALID_STATUS_TRANSITION',
    NOT_REQUESTED: 'BOOKING_NOT_REQUESTED',
};
exports.WAITLIST_ERROR_CODES = {
    ENTRY_NOT_FOUND: 'waitlist.entry_not_found',
    NOT_WAITING: 'waitlist.not_waiting',
    NOT_OFFERED: 'waitlist.not_offered',
};
exports.QUEUE_ERROR_CODES = {
    TOKEN_NOT_FOUND: 'queue.token_not_found',
    INVALID_TRANSITION: 'queue.invalid_transition',
};
exports.DEPOSIT_ERROR_CODES = {
    DEPOSIT_NOT_FOUND: 'deposit.not_found',
    NOT_PENDING: 'deposit.not_pending',
    NOT_CAPTURED: 'deposit.not_captured',
    ONLINE_CAPTURE_NOT_SUPPORTED: 'deposit.online_capture_not_supported',
};
exports.WAITLIST_OFFER_HOLD_HOURS = 24;
//# sourceMappingURL=bookings.constants.js.map