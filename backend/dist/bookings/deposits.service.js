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
exports.DepositsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
let DepositsService = class DepositsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async create(businessId, dto) {
        const appointment = await this.tenantPrisma.client.appointment.findUnique({
            where: { id: dto.appointmentId },
        });
        if (!appointment || appointment.businessId !== businessId) {
            throw new common_1.NotFoundException('Appointment not found');
        }
        return this.tenantPrisma.client.deposit.create({
            data: {
                appointmentId: dto.appointmentId,
                amount: dto.amount,
                method: dto.method,
            },
        });
    }
    list(appointmentId) {
        return this.tenantPrisma.client.deposit.findMany({
            where: { appointmentId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async capture(businessId, id) {
        const deposit = await this.findWithStatus(businessId, id, prisma_1.DepositStatus.pending);
        if (deposit.method !== 'cash') {
            throw new app_exception_1.AppException(bookings_constants_1.DEPOSIT_ERROR_CODES.ONLINE_CAPTURE_NOT_SUPPORTED, `Capturing a "${deposit.method}" deposit isn't supported yet — there's no one-off-charge gateway primitive to reuse. Use "cash" for now.`, common_1.HttpStatus.NOT_IMPLEMENTED);
        }
        const [updated] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.deposit.update({
                where: { id },
                data: { status: prisma_1.DepositStatus.captured },
            }),
            this.tenantPrisma.client.appointment.update({
                where: { id: deposit.appointmentId },
                data: { depositPaid: { increment: deposit.amount } },
            }),
        ]);
        return updated;
    }
    async refund(businessId, id) {
        const deposit = await this.findWithStatus(businessId, id, prisma_1.DepositStatus.captured);
        const [updated] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.deposit.update({
                where: { id },
                data: { status: prisma_1.DepositStatus.refunded },
            }),
            this.tenantPrisma.client.appointment.update({
                where: { id: deposit.appointmentId },
                data: { depositPaid: { decrement: deposit.amount } },
            }),
        ]);
        return updated;
    }
    async forfeitForAppointment(appointmentId) {
        await this.tenantPrisma.client.deposit.updateMany({
            where: { appointmentId, status: prisma_1.DepositStatus.captured },
            data: { status: prisma_1.DepositStatus.forfeited },
        });
    }
    async findWithStatus(businessId, id, status) {
        const deposit = await this.tenantPrisma.client.deposit.findUnique({
            where: { id },
        });
        if (!deposit || deposit.businessId !== businessId) {
            throw new common_1.NotFoundException('Deposit not found');
        }
        if (deposit.status !== status) {
            throw new app_exception_1.AppException(status === prisma_1.DepositStatus.pending
                ? bookings_constants_1.DEPOSIT_ERROR_CODES.NOT_PENDING
                : bookings_constants_1.DEPOSIT_ERROR_CODES.NOT_CAPTURED, `Deposit is "${deposit.status}", expected "${status}"`, common_1.HttpStatus.CONFLICT);
        }
        return deposit;
    }
};
exports.DepositsService = DepositsService;
exports.DepositsService = DepositsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], DepositsService);
//# sourceMappingURL=deposits.service.js.map