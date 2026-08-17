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
var WaitlistService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaitlistService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const booking_lock_util_1 = require("./booking-lock.util");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
let WaitlistService = WaitlistService_1 = class WaitlistService {
    tenantPrisma;
    sendGate;
    logger = new common_1.Logger(WaitlistService_1.name);
    constructor(tenantPrisma, sendGate) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
    }
    async join(businessId, dto) {
        const service = await this.tenantPrisma.client.product.findUnique({
            where: { id: dto.serviceId },
        });
        if (!service) {
            throw new common_1.NotFoundException('Service not found');
        }
        const customer = await this.tenantPrisma.client.customer.upsert({
            where: { businessId_phone: { businessId, phone: dto.customerPhone } },
            create: {
                businessId,
                phone: dto.customerPhone,
                name: dto.customerName,
            },
            update: {},
        });
        return this.tenantPrisma.client.waitlistEntry.create({
            data: {
                customerId: customer.id,
                serviceId: dto.serviceId,
                staffUserId: dto.staffId,
                preferredFrom: dto.preferredFrom
                    ? new Date(dto.preferredFrom)
                    : undefined,
                preferredTo: dto.preferredTo ? new Date(dto.preferredTo) : undefined,
            },
            include: { customer: true, service: true },
        });
    }
    list(status) {
        return this.tenantPrisma.client.waitlistEntry.findMany({
            where: { status },
            orderBy: { createdAt: 'asc' },
            include: { customer: true, service: true },
        });
    }
    async offer(businessId, id, dto) {
        const entry = await this.findWithStatus(id, prisma_1.WaitlistStatus.waiting);
        const updated = await this.tenantPrisma.client.waitlistEntry.update({
            where: { id },
            data: {
                status: prisma_1.WaitlistStatus.offered,
                offeredStartsAt: new Date(dto.startsAt),
                offeredEndsAt: new Date(dto.endsAt),
            },
            include: { service: true },
        });
        await this.sendGate
            .send({
            businessId,
            customerId: entry.customerId,
            templateKey: 'waitlist_offer',
            variables: {
                serviceName: updated.service.name,
                dateTime: updated.offeredStartsAt.toISOString(),
            },
        })
            .catch(() => undefined);
        return updated;
    }
    async accept(businessId, id) {
        const entry = await this.findWithStatus(id, prisma_1.WaitlistStatus.offered);
        const startsAt = entry.offeredStartsAt;
        const endsAt = entry.offeredEndsAt;
        const appointment = await this.tenantPrisma.client.$transaction(async (tx) => {
            await (0, booking_lock_util_1.assertSlotAvailable)(tx, {
                businessId,
                staffId: entry.staffUserId,
                serviceId: entry.serviceId,
                startsAt,
                endsAt,
            });
            return tx.appointment.create({
                data: {
                    businessId,
                    serviceId: entry.serviceId,
                    staffUserId: entry.staffUserId,
                    customerId: entry.customerId,
                    startsAt,
                    endsAt,
                    status: prisma_1.AppointmentStatus.confirmed,
                    source: prisma_1.AppointmentSource.waitlist,
                },
                include: { service: true, customer: true },
            });
        });
        await this.tenantPrisma.client.waitlistEntry.update({
            where: { id },
            data: { status: prisma_1.WaitlistStatus.booked },
        });
        return appointment;
    }
    async cancel(id) {
        await this.findEntry(id);
        return this.tenantPrisma.client.waitlistEntry.update({
            where: { id },
            data: { status: prisma_1.WaitlistStatus.cancelled },
        });
    }
    async tryAutoOffer(businessId, freed) {
        try {
            const candidate = await this.tenantPrisma.client.waitlistEntry.findFirst({
                where: {
                    businessId,
                    serviceId: freed.serviceId,
                    status: prisma_1.WaitlistStatus.waiting,
                    OR: [
                        { staffUserId: null },
                        ...(freed.staffUserId ? [{ staffUserId: freed.staffUserId }] : []),
                    ],
                    AND: [
                        {
                            OR: [
                                { preferredFrom: null },
                                { preferredFrom: { lte: freed.startsAt } },
                            ],
                        },
                        {
                            OR: [
                                { preferredTo: null },
                                { preferredTo: { gte: freed.endsAt } },
                            ],
                        },
                    ],
                },
                orderBy: { createdAt: 'asc' },
            });
            if (!candidate)
                return;
            await this.offer(businessId, candidate.id, {
                startsAt: freed.startsAt.toISOString(),
                endsAt: freed.endsAt.toISOString(),
            });
        }
        catch (error) {
            this.logger.warn(`Waitlist auto-offer skipped for business ${businessId}: ${error.message}`);
        }
    }
    async findEntry(id) {
        const entry = await this.tenantPrisma.client.waitlistEntry.findUnique({
            where: { id },
        });
        if (!entry) {
            throw new common_1.NotFoundException('Waitlist entry not found');
        }
        return entry;
    }
    async findWithStatus(id, status) {
        const entry = await this.findEntry(id);
        if (entry.status !== status) {
            throw new app_exception_1.AppException(status === prisma_1.WaitlistStatus.waiting
                ? bookings_constants_1.WAITLIST_ERROR_CODES.NOT_WAITING
                : bookings_constants_1.WAITLIST_ERROR_CODES.NOT_OFFERED, `Waitlist entry is "${entry.status}", expected "${status}"`, common_1.HttpStatus.CONFLICT);
        }
        return entry;
    }
};
exports.WaitlistService = WaitlistService;
exports.WaitlistService = WaitlistService = WaitlistService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService])
], WaitlistService);
//# sourceMappingURL=waitlist.service.js.map