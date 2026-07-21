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
exports.PublicBookingService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const working_hours_util_1 = require("./working-hours.util");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
const RESCHEDULE_TOKEN_BYTES = 16;
let PublicBookingService = class PublicBookingService {
    prisma;
    sendGate;
    constructor(prisma, sendGate) {
        this.prisma = prisma;
        this.sendGate = sendGate;
    }
    async resolveBusiness(slug) {
        const business = await this.prisma.business.findUnique({ where: { slug } });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        return business;
    }
    async listServices(slug) {
        const business = await this.resolveBusiness(slug);
        return this.prisma.product.findMany({
            where: {
                businessId: business.id,
                kind: prisma_1.ProductKind.service,
                active: true,
            },
            orderBy: { name: 'asc' },
        });
    }
    async getSlots(slug, query) {
        const business = await this.resolveBusiness(slug);
        const service = await this.prisma.product.findFirst({
            where: {
                id: query.service,
                businessId: business.id,
                kind: prisma_1.ProductKind.service,
            },
        });
        if (!service) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SERVICE_NOT_FOUND, 'Service not found', common_1.HttpStatus.NOT_FOUND);
        }
        const dayStart = new Date(`${query.date}T00:00:00.000Z`);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const existing = await this.prisma.appointment.findMany({
            where: {
                businessId: business.id,
                ...(query.staff ? { staffUserId: query.staff } : {}),
                status: { notIn: [prisma_1.AppointmentStatus.cancelled] },
                startsAt: { gte: dayStart, lt: dayEnd },
            },
            select: { startsAt: true, endsAt: true },
        });
        const slots = (0, working_hours_util_1.computeAvailableSlots)({
            workingHours: business.workingHours,
            timezone: business.timezone,
            date: query.date,
            durationMin: service.durationMin ?? 30,
            busyIntervals: existing.map((a) => ({
                start: a.startsAt,
                end: a.endsAt,
            })),
        });
        return { slots: slots.map((s) => s.toISOString()) };
    }
    async createBooking(slug, dto) {
        const business = await this.resolveBusiness(slug);
        const startsAt = new Date(dto.startsAt);
        const service = await this.prisma.product.findFirst({
            where: {
                id: dto.serviceId,
                businessId: business.id,
                kind: prisma_1.ProductKind.service,
            },
        });
        if (!service) {
            throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SERVICE_NOT_FOUND, 'Service not found', common_1.HttpStatus.NOT_FOUND);
        }
        const endsAt = new Date(startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000);
        const appointment = await this.prisma.$transaction(async (tx) => {
            const lockKey = `${business.id}:${dto.staffId ?? dto.serviceId}:${startsAt.toISOString()}`;
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
            const conflict = await tx.appointment.findFirst({
                where: {
                    businessId: business.id,
                    ...(dto.staffId ? { staffUserId: dto.staffId } : {}),
                    status: { notIn: [prisma_1.AppointmentStatus.cancelled] },
                    startsAt: { lt: endsAt },
                    endsAt: { gt: startsAt },
                },
            });
            if (conflict) {
                throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SLOT_UNAVAILABLE, 'That slot was just taken', common_1.HttpStatus.CONFLICT);
            }
            const customer = await tx.customer.upsert({
                where: {
                    businessId_phone: {
                        businessId: business.id,
                        phone: dto.customerPhone,
                    },
                },
                create: {
                    businessId: business.id,
                    phone: dto.customerPhone,
                    name: dto.customerName,
                },
                update: {},
            });
            return tx.appointment.create({
                data: {
                    businessId: business.id,
                    serviceId: dto.serviceId,
                    staffUserId: dto.staffId,
                    customerId: customer.id,
                    startsAt,
                    endsAt,
                    source: 'link',
                    rescheduleToken: (0, crypto_1.randomBytes)(RESCHEDULE_TOKEN_BYTES).toString('hex'),
                },
            });
        });
        await this.sendGate
            .send({
            businessId: business.id,
            customerId: appointment.customerId,
            templateKey: 'booking_confirm',
            variables: {
                serviceName: service.name,
                dateTime: appointment.startsAt.toISOString(),
            },
        })
            .catch(() => undefined);
        return appointment;
    }
    async reschedule(token, startsAt) {
        const appointment = await this.loadByToken(token);
        const durationMs = appointment.endsAt.getTime() - appointment.startsAt.getTime();
        const newStart = new Date(startsAt);
        const newEnd = new Date(newStart.getTime() + durationMs);
        return this.prisma.$transaction(async (tx) => {
            const conflict = await tx.appointment.findFirst({
                where: {
                    id: { not: appointment.id },
                    businessId: appointment.businessId,
                    ...(appointment.staffUserId
                        ? { staffUserId: appointment.staffUserId }
                        : {}),
                    status: { notIn: [prisma_1.AppointmentStatus.cancelled] },
                    startsAt: { lt: newEnd },
                    endsAt: { gt: newStart },
                },
            });
            if (conflict) {
                throw new app_exception_1.AppException(bookings_constants_1.BOOKING_ERROR_CODES.SLOT_UNAVAILABLE, 'That slot was just taken', common_1.HttpStatus.CONFLICT);
            }
            return tx.appointment.update({
                where: { id: appointment.id },
                data: { startsAt: newStart, endsAt: newEnd },
            });
        });
    }
    async cancel(token) {
        const appointment = await this.loadByToken(token);
        return this.prisma.appointment.update({
            where: { id: appointment.id },
            data: { status: prisma_1.AppointmentStatus.cancelled },
        });
    }
    async loadByToken(token) {
        const appointment = await this.prisma.appointment.findUnique({
            where: { rescheduleToken: token },
        });
        if (!appointment) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        return appointment;
    }
};
exports.PublicBookingService = PublicBookingService;
exports.PublicBookingService = PublicBookingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService])
], PublicBookingService);
//# sourceMappingURL=public-booking.service.js.map