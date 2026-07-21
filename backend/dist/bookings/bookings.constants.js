"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOKING_ERROR_CODES = exports.APPOINTMENT_STATUS_TRANSITIONS = void 0;
const prisma_1 = require("../../generated/prisma");
exports.APPOINTMENT_STATUS_TRANSITIONS = {
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
};
//# sourceMappingURL=bookings.constants.js.map