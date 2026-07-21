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
const review_token_util_1 = require("../reviews/review-token.util");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
let AppointmentsService = class AppointmentsService {
    tenantPrisma;
    reviewRequests;
    constructor(tenantPrisma, reviewRequests) {
        this.tenantPrisma = tenantPrisma;
        this.reviewRequests = reviewRequests;
    }
    findAll(query) {
        return this.tenantPrisma.client.appointment.findMany({
            where: {
                ...(query.staff ? { staffUserId: query.staff } : {}),
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
            include: { service: true, customer: true },
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
        }
        return updated;
    }
};
exports.AppointmentsService = AppointmentsService;
exports.AppointmentsService = AppointmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        review_requests_service_1.ReviewRequestsService])
], AppointmentsService);
//# sourceMappingURL=appointments.service.js.map