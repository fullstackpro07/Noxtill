"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSlotAvailable = assertSlotAvailable;
const common_1 = require("@nestjs/common");
const app_exception_1 = require("../common/filters/app.exception");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
async function assertSlotAvailable(tx, params) {
    const lockKey = `${params.businessId}:${params.staffId ?? params.serviceId}:${params.startsAt.toISOString()}`;
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const conflict = await tx.appointment.findFirst({
        where: {
            ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
            businessId: params.businessId,
            ...(params.staffId ? { staffUserId: params.staffId } : {}),
            status: { notIn: [prisma_1.AppointmentStatus.cancelled] },
            startsAt: { lt: params.endsAt },
            endsAt: { gt: params.startsAt },
        },
    });
    if (conflict) {
        throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SLOT_UNAVAILABLE, 'That slot was just taken', common_1.HttpStatus.CONFLICT);
    }
}
//# sourceMappingURL=booking-lock.util.js.map