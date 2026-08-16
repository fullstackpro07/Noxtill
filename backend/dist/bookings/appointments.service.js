"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppointmentsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const review_requests_service_1 = require("../reviews/review-requests.service");
const activity_service_1 = require("../activity/activity.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const waitlist_service_1 = require("./waitlist.service");
const deposits_service_1 = require("./deposits.service");
const review_token_util_1 = require("../reviews/review-token.util");
const booking_lock_util_1 = require("./booking-lock.util");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let AppointmentsService = class AppointmentsService {
    tenantPrisma;
    reviewRequests;
    activity;
    sendGate;
    waitlist;
    deposits;
    constructor(tenantPrisma, reviewRequests, activity, sendGate, waitlist, deposits) {
        this.tenantPrisma = tenantPrisma;
        this.reviewRequests = reviewRequests;
        this.activity = activity;
        this.sendGate = sendGate;
        this.waitlist = waitlist;
        this.deposits = deposits;
    }
    findAll(query) {
        return this.tenantPrisma.client.appointment.findMany({
            where: {
                ...(query.staff ? { staffUserId: query.staff } : {}),
                ...(query.status ? { status: query.status } : {}),
                ...(query.from || query.to
                    ? {
                        startsAt: {
                            ...(query.from ? { gte: new Date(query.from) } : {}),
                            ...(query.to ? { lte: new Date(query.to) } : {}),
                        },
                    }
                    : {}),
            },
            orderBy: { startsAt: 'asc' },
            include: {
                service: true,
                customer: true,
                staffUser: { include: { user: true } },
            },
        });
    }
    async updateStatus(businessId, id, nextStatus) {
        const appointment = await this.tenantPrisma.client.appointment.findUnique({
            where: { id },
        });
        if (!appointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        const allowed = bookings_constants_1.APPOINTMENT_STATUS_TRANSITIONS[appointment.status];
        if (!allowed.includes(nextStatus)) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.INVALID_STATUS_TRANSITION, `Cannot move an appointment from "${appointment.status}" to "${nextStatus}"`, common_1.HttpStatus.BAD_REQUEST);
        }
        const updated = await this.tenantPrisma.client.appointment.update({
            where: { id },
            data: { status: nextStatus },
        });
        if (nextStatus === prisma_1.AppointmentStatus.completed) {
            const token = (0, review_token_util_1.generateReviewToken)();
            await this.tenantPrisma.client.reviewRequest.create({
                data: {
                    businessId,
                    customerId: updated.customerId,
                    token,
                    source: 'appointment',
                    sourceId: updated.id,
                },
            });
            await this.activity.record(businessId, {
                type: 'booking',
                description: 'Appointment completed',
                entityType: 'Appointment',
                entityId: updated.id,
            });
            await this.reviewRequests.scheduleSend(businessId, updated.customerId, token);
        }
        if (nextStatus === prisma_1.AppointmentStatus.no_show) {
            const customer = await this.tenantPrisma.client.customer.findUnique({
                where: { id: updated.customerId },
            });
            if (customer && !customer.tags.includes('No-show')) {
                await this.tenantPrisma.client.customer.update({
                    where: { id: updated.customerId },
                    data: { tags: [...customer.tags, 'No-show'] },
                });
            }
            await this.deposits.forfeitForAppointment(updated.id);
        }
        if (nextStatus === prisma_1.AppointmentStatus.cancelled) {
            await this.waitlist.tryAutoOffer(businessId, {
                serviceId: updated.serviceId,
                staffUserId: updated.staffUserId,
                startsAt: updated.startsAt,
                endsAt: updated.endsAt,
            });
        }
        return updated;
    }
    async reschedule(businessId, id, dto) {
        const appointment = await this.tenantPrisma.client.appointment.findUnique({
            where: { id },
        });
        if (!appointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        const durationMs = appointment.endsAt.getTime() - appointment.startsAt.getTime();
        const newStart = new Date(dto.startsAt);
        const newEnd = new Date(newStart.getTime() + durationMs);
        const staffId = dto.staffUserId !== undefined ? dto.staffUserId : appointment.staffUserId;
        return this.tenantPrisma.client.$transaction(async (tx) => {
            await (0, booking_lock_util_1.assertSlotAvailable)(tx, {
                businessId,
                staffId,
                serviceId: appointment.serviceId,
                startsAt: newStart,
                endsAt: newEnd,
                excludeAppointmentId: appointment.id,
            });
            return tx.appointment.update({
                where: { id: appointment.id },
                data: { startsAt: newStart, endsAt: newEnd, staffUserId: staffId },
                include: {
                    service: true,
                    customer: true,
                    staffUser: { include: { user: true } },
                },
            });
        });
    }
    async createWalkIn(businessId, dto) {
        const service = await this.tenantPrisma.client.product.findFirst({
            where: { id: dto.serviceId, kind: prisma_1.ProductKind.service },
        });
        if (!service) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SERVICE_NOT_FOUND, 'Service not found', common_1.HttpStatus.NOT_FOUND);
        }
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000);
        return this.tenantPrisma.client.$transaction(async (tx) => {
            await (0, booking_lock_util_1.assertSlotAvailable)(tx, {
                businessId,
                staffId: dto.staffId,
                serviceId: dto.serviceId,
                startsAt,
                endsAt,
            });
            const customer = await tx.customer.upsert({
                where: {
                    businessId_phone: { businessId, phone: dto.customerPhone },
                },
                create: {
                    businessId,
                    phone: dto.customerPhone,
                    name: dto.customerName,
                },
                update: {},
            });
            return tx.appointment.create({
                data: {
                    businessId,
                    serviceId: dto.serviceId,
                    staffUserId: dto.staffId,
                    customerId: customer.id,
                    startsAt,
                    endsAt,
                    status: prisma_1.AppointmentStatus.confirmed,
                    source: prisma_1.AppointmentSource.walk_in,
                },
                include: {
                    service: true,
                    customer: true,
                    staffUser: { include: { user: true } },
                },
            });
        });
    }
    async createRequest(businessId, dto) {
        const service = await this.tenantPrisma.client.product.findFirst({
            where: { id: dto.serviceId, kind: prisma_1.ProductKind.service },
        });
        if (!service) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SERVICE_NOT_FOUND, 'Service not found', common_1.HttpStatus.NOT_FOUND);
        }
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000);
        return this.tenantPrisma.client.$transaction(async (tx) => {
            await (0, booking_lock_util_1.assertSlotAvailable)(tx, {
                businessId,
                staffId: dto.staffId,
                serviceId: dto.serviceId,
                startsAt,
                endsAt,
            });
            const customer = await tx.customer.upsert({
                where: {
                    businessId_phone: { businessId, phone: dto.customerPhone },
                },
                create: {
                    businessId,
                    phone: dto.customerPhone,
                    name: dto.customerName,
                },
                update: {},
            });
            return tx.appointment.create({
                data: {
                    businessId,
                    serviceId: dto.serviceId,
                    staffUserId: dto.staffId,
                    customerId: customer.id,
                    startsAt,
                    endsAt,
                    status: prisma_1.AppointmentStatus.requested,
                },
                include: {
                    service: true,
                    customer: true,
                    staffUser: { include: { user: true } },
                },
            });
        });
    }
    async requireRequested(id) {
        const appointment = await this.tenantPrisma.client.appointment.findUnique({
            where: { id },
            include: { service: true },
        });
        if (!appointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        if (appointment.status !== prisma_1.AppointmentStatus.requested) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.NOT_REQUESTED, `Appointment is "${appointment.status}", expected "requested"`, common_1.HttpStatus.CONFLICT);
        }
        return appointment;
    }
    async approve(businessId, id) {
        const requested = await this.requireRequested(id);
        const updated = await this.updateStatus(businessId, id, prisma_1.AppointmentStatus.confirmed);
        await this.sendGate
            .send({
            businessId,
            customerId: updated.customerId,
            templateKey: 'booking_confirm',
            variables: {
                serviceName: requested.service.name,
                dateTime: updated.startsAt.toISOString(),
            },
        })
            .catch(() => undefined);
        return updated;
    }
    async decline(businessId, id, dto) {
        const requested = await this.requireRequested(id);
        const updated = await this.updateStatus(businessId, id, prisma_1.AppointmentStatus.cancelled);
        await this.sendGate
            .send({
            businessId,
            customerId: updated.customerId,
            templateKey: 'booking_declined',
            variables: {
                serviceName: requested.service.name,
                reason: dto.reason ?? 'Please contact us to rebook.',
            },
        })
            .catch(() => undefined);
        return updated;
    }
    async suggestAlternative(businessId, id, dto) {
        const requested = await this.requireRequested(id);
        await this.sendGate
            .send({
            businessId,
            customerId: requested.customerId,
            templateKey: 'booking_suggest_alternative',
            variables: {
                serviceName: requested.service.name,
                dateTime: new Date(dto.startsAt).toISOString(),
            },
        })
            .catch(() => undefined);
        return requested;
    }
    async noShowReport(businessId, months = 6) {
        const since = new Date();
        since.setUTCMonth(since.getUTCMonth() - months);
        since.setUTCDate(1);
        since.setUTCHours(0, 0, 0, 0);
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
      FROM appointments
      WHERE business_id = ${businessId} AND starts_at >= ${since}
        AND status IN ('completed', 'no_show')
      GROUP BY month
      ORDER BY month
    `;
        const trend = rows.map((row) => {
            const total = Number(row.total);
            const noShows = Number(row.no_shows);
            return {
                month: row.month,
                total,
                noShows,
                rate: total > 0 ? round2((noShows / total) * 100) : 0,
            };
        });
        const totalAppointments = trend.reduce((sum, r) => sum + r.total, 0);
        const totalNoShows = trend.reduce((sum, r) => sum + r.noShows, 0);
        const repeatOffenderRows = await this.tenantPrisma.client.$queryRaw `
      SELECT a.customer_id, c.name, COUNT(*) AS no_show_count
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.business_id = ${businessId} AND a.status = 'no_show' AND a.starts_at >= ${since}
      GROUP BY a.customer_id, c.name
      HAVING COUNT(*) >= 2
      ORDER BY no_show_count DESC
    `;
        return {
            months,
            overallRate: totalAppointments > 0
                ? round2((totalNoShows / totalAppointments) * 100)
                : 0,
            trend,
            repeatOffenders: repeatOffenderRows.map((row) => ({
                customerId: row.customer_id,
                name: row.name,
                noShowCount: Number(row.no_show_count),
            })),
        };
    }
};
exports.AppointmentsService = AppointmentsService;
exports.AppointmentsService = AppointmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        review_requests_service_1.ReviewRequestsService,
        activity_service_1.ActivityService,
        send_gate_service_1.SendGateService,
        waitlist_service_1.WaitlistService,
        deposits_service_1.DepositsService])
], AppointmentsService);
//# sourceMappingURL=appointments.service.js.map