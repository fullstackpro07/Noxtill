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
exports.InstallmentsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const audit_service_1 = require("../common/audit/audit.service");
const activity_service_1 = require("../activity/activity.service");
const app_exception_1 = require("../common/filters/app.exception");
const credit_constants_1 = require("./credit.constants");
const prisma_1 = require("../../generated/prisma");
function todayEnd() {
    const d = new Date();
    d.setUTCHours(23, 59, 59, 999);
    return d;
}
let InstallmentsService = class InstallmentsService {
    tenantPrisma;
    auditService;
    activity;
    constructor(tenantPrisma, auditService, activity) {
        this.tenantPrisma = tenantPrisma;
        this.auditService = auditService;
        this.activity = activity;
    }
    list(due) {
        return this.tenantPrisma.client.installment.findMany({
            where: {
                status: prisma_1.InstallmentStatus.pending,
                ...(due === 'today' ? { dueDate: { lte: todayEnd() } } : {}),
            },
            orderBy: { dueDate: 'asc' },
            include: {
                plan: { include: { customer: true } },
            },
        });
    }
    async pay(businessId, id) {
        const installment = await this.tenantPrisma.client.installment.findUnique({
            where: { id },
            include: { plan: { include: { customer: true } } },
        });
        if (!installment || installment.businessId !== businessId) {
            throw new common_1.NotFoundException('Installment not found');
        }
        if (installment.status !== prisma_1.InstallmentStatus.pending) {
            throw new app_exception_1.AppException(credit_constants_1.CREDIT_ERROR_CODES.INSTALLMENT_NOT_PENDING, `Instalment is "${installment.status}", expected "pending"`, common_1.HttpStatus.CONFLICT);
        }
        const { customer, id: planId } = installment.plan;
        const [entry, updatedInstallment] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.creditEntry.create({
                data: {
                    businessId,
                    customerId: customer.id,
                    kind: 'payment',
                    amount: installment.amount,
                    note: `Instalment ${installment.seq} of plan ${planId}`,
                },
            }),
            this.tenantPrisma.client.installment.update({
                where: { id },
                data: { status: prisma_1.InstallmentStatus.paid, paidAt: new Date() },
            }),
        ]);
        await this.tenantPrisma.client.installment.update({
            where: { id },
            data: { creditEntryId: entry.id },
        });
        const remaining = await this.tenantPrisma.client.installment.count({
            where: { planId, status: prisma_1.InstallmentStatus.pending },
        });
        if (remaining === 0) {
            await this.tenantPrisma.client.installmentPlan.update({
                where: { id: planId },
                data: { status: prisma_1.InstallmentPlanStatus.completed },
            });
        }
        await this.auditService.log({
            entity: 'Installment',
            entityId: id,
            action: 'credit.installment_paid',
            after: { entry, installment: updatedInstallment },
        });
        await this.activity.record(businessId, {
            type: 'payment',
            description: `Instalment ${installment.seq} paid by ${customer.name} — ${Number(installment.amount)}`,
            amount: Number(installment.amount),
            entityType: 'CreditEntry',
            entityId: entry.id,
        });
        return {
            entry,
            installment: { ...updatedInstallment, creditEntryId: entry.id },
        };
    }
};
exports.InstallmentsService = InstallmentsService;
exports.InstallmentsService = InstallmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        audit_service_1.AuditService,
        activity_service_1.ActivityService])
], InstallmentsService);
//# sourceMappingURL=installments.service.js.map