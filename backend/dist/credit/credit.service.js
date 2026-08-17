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
exports.CreditService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const audit_service_1 = require("../common/audit/audit.service");
const activity_service_1 = require("../activity/activity.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const credit_types_1 = require("./credit.types");
const credit_constants_1 = require("./credit.constants");
const review_token_util_1 = require("../reviews/review-token.util");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let CreditService = class CreditService {
    tenantPrisma;
    cls;
    auditService;
    activity;
    constructor(tenantPrisma, cls, auditService, activity) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.auditService = auditService;
        this.activity = activity;
    }
    async listDebtors() {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT v.customer_id, c.name, c.phone, v.balance, v.last_entry_at, v.days_outstanding, c.opted_out
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0
      ORDER BY v.balance DESC
    `;
        return rows.map((row) => ({
            customerId: row.customer_id,
            name: row.name,
            phone: row.phone,
            balance: Number(row.balance),
            lastEntryAt: row.last_entry_at,
            daysOutstanding: row.days_outstanding,
            optedOutOfReminders: row.opted_out,
        }));
    }
    async getLedger(customerId) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const entries = await this.tenantPrisma.client.creditEntry.findMany({
            where: { customerId },
            orderBy: { createdAt: 'asc' },
        });
        const rows = (0, credit_types_1.buildLedgerRows)(entries);
        return {
            customerId,
            name: customer.name,
            phone: customer.phone,
            balance: rows.length ? rows[rows.length - 1].runningBalance : 0,
            entries: rows,
        };
    }
    async getBalance(customerId) {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT balance FROM v_credit_balances WHERE business_id = ${businessId} AND customer_id = ${customerId}
    `;
        return rows[0] ? Number(rows[0].balance) : 0;
    }
    async recordPayment(dto) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: dto.customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const before = await this.getBalance(dto.customerId);
        const businessId = customer.businessId;
        const entry = await this.tenantPrisma.client.creditEntry.create({
            data: {
                businessId,
                customerId: dto.customerId,
                kind: 'payment',
                amount: dto.amount,
                method: dto.method,
                note: dto.note,
            },
        });
        const after = await this.getBalance(dto.customerId);
        await this.auditService.log({
            entity: 'CreditEntry',
            entityId: entry.id,
            action: 'credit.payment',
            before: { balance: before },
            after: { balance: after, entry },
        });
        await this.activity.record(businessId, {
            type: 'payment',
            description: `Credit payment from ${customer.name} — ${dto.amount}`,
            amount: dto.amount,
            entityType: 'CreditEntry',
            entityId: entry.id,
        });
        return { entry, balanceBefore: before, balanceAfter: after };
    }
    async createInstallmentPlan(customerId, dto) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const sum = round2(dto.installments.reduce((s, i) => s + i.amount, 0));
        if (sum !== round2(dto.totalAmount)) {
            throw new app_exception_1.AppException(credit_constants_1.CREDIT_ERROR_CODES.PLAN_AMOUNT_MISMATCH, `Instalment amounts sum to ${sum}, which doesn't match totalAmount ${dto.totalAmount}`, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.tenantPrisma.client.installmentPlan.create({
            data: {
                businessId: customer.businessId,
                customerId,
                totalAmount: dto.totalAmount,
                note: dto.note,
                installments: {
                    create: dto.installments.map((line, i) => ({
                        businessId: customer.businessId,
                        seq: i + 1,
                        amount: line.amount,
                        dueDate: new Date(line.dueDate),
                    })),
                },
            },
            include: { installments: { orderBy: { seq: 'asc' } } },
        });
    }
    listInstallmentPlans(customerId) {
        return this.tenantPrisma.client.installmentPlan.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            include: { installments: { orderBy: { seq: 'asc' } } },
        });
    }
    async writeOff(customerId, dto) {
        if (dto.confirm !== credit_constants_1.WRITE_OFF_CONFIRM_PHRASE) {
            throw new app_exception_1.AppException(credit_constants_1.CREDIT_ERROR_CODES.WRITE_OFF_CONFIRMATION_MISMATCH, `Type "${credit_constants_1.WRITE_OFF_CONFIRM_PHRASE}" exactly to confirm this irreversible action`, common_1.HttpStatus.BAD_REQUEST);
        }
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const before = await this.getBalance(customerId);
        if (dto.amount > before) {
            throw new app_exception_1.AppException(credit_constants_1.CREDIT_ERROR_CODES.WRITE_OFF_EXCEEDS_BALANCE, `Cannot write off ${dto.amount} — outstanding balance is only ${before}`, common_1.HttpStatus.BAD_REQUEST);
        }
        const businessId = customer.businessId;
        const entry = await this.tenantPrisma.client.creditEntry.create({
            data: {
                businessId,
                customerId,
                kind: 'write_off',
                amount: dto.amount,
                note: dto.reason,
            },
        });
        const after = await this.getBalance(customerId);
        await this.auditService.log({
            entity: 'CreditEntry',
            entityId: entry.id,
            action: 'credit.write_off',
            before: { balance: before },
            after: { balance: after, entry, reason: dto.reason },
        });
        await this.activity.record(businessId, {
            type: 'payment',
            description: `Wrote off ${dto.amount} for ${customer.name}: ${dto.reason}`,
            amount: dto.amount,
            entityType: 'CreditEntry',
            entityId: entry.id,
        });
        return { entry, balanceBefore: before, balanceAfter: after };
    }
    async createShareLink(customerId) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const existing = await this.tenantPrisma.client.creditShareLink.findFirst({
            where: { customerId, revoked: false },
        });
        if (existing) {
            return existing;
        }
        return this.tenantPrisma.client.creditShareLink.create({
            data: {
                businessId: customer.businessId,
                customerId,
                token: (0, review_token_util_1.generateReviewToken)(),
            },
        });
    }
    listShareLinks(customerId) {
        return this.tenantPrisma.client.creditShareLink.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async revokeShareLink(id) {
        const link = await this.tenantPrisma.client.creditShareLink.findUnique({
            where: { id },
        });
        if (!link) {
            throw new common_1.NotFoundException('Share link not found');
        }
        return this.tenantPrisma.client.creditShareLink.update({
            where: { id },
            data: { revoked: true },
        });
    }
};
exports.CreditService = CreditService;
exports.CreditService = CreditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        audit_service_1.AuditService,
        activity_service_1.ActivityService])
], CreditService);
//# sourceMappingURL=credit.service.js.map