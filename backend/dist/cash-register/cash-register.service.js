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
exports.CashRegisterService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const cash_register_constants_1 = require("./cash-register.constants");
const prisma_1 = require("../../generated/prisma");
let CashRegisterService = class CashRegisterService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async getCurrentShift(businessId) {
        return this.tenantPrisma.client.cashShift.findFirst({
            where: { businessId, status: prisma_1.CashShiftStatus.open },
            include: { movements: { orderBy: { createdAt: 'asc' } } },
        });
    }
    async openShift(businessId, dto) {
        const existing = await this.getCurrentShift(businessId);
        if (existing) {
            throw new app_exception_1.AppException(cash_register_constants_1.CASH_REGISTER_ERROR_CODES.SHIFT_ALREADY_OPEN, 'A cash shift is already open for this business.', common_1.HttpStatus.CONFLICT);
        }
        const openedByUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        return this.tenantPrisma.client.cashShift.create({
            data: {
                businessId,
                openedByUserId,
                openingFloat: dto.openingFloat,
                movements: {
                    create: {
                        businessId,
                        type: prisma_1.CashMovementType.opening,
                        amount: dto.openingFloat,
                        recordedByUserId: openedByUserId,
                    },
                },
            },
            include: { movements: true },
        });
    }
    async closeShift(businessId) {
        const shift = await this.requireOpenShift(businessId);
        return this.tenantPrisma.client.cashShift.update({
            where: { id: shift.id },
            data: { status: prisma_1.CashShiftStatus.closed, closedAt: new Date() },
        });
    }
    async recordMovement(businessId, dto) {
        const shift = await this.requireOpenShift(businessId);
        const recordedByUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        return this.tenantPrisma.client.cashMovement.create({
            data: {
                businessId,
                shiftId: shift.id,
                type: dto.type,
                amount: dto.amount,
                note: dto.note,
                recordedByUserId,
            },
        });
    }
    async recordSaleMovement(businessId, amount, orderId) {
        const shift = await this.getCurrentShift(businessId);
        if (!shift)
            return;
        await this.tenantPrisma.client.cashMovement.create({
            data: {
                businessId,
                shiftId: shift.id,
                type: prisma_1.CashMovementType.sale,
                amount,
                note: `Order ${orderId}`,
            },
        });
    }
    async recordRefundMovement(businessId, amount, note) {
        const shift = await this.getCurrentShift(businessId);
        if (!shift)
            return;
        await this.tenantPrisma.client.cashMovement.create({
            data: {
                businessId,
                shiftId: shift.id,
                type: prisma_1.CashMovementType.refund,
                amount,
                note,
            },
        });
    }
    async reconcile(businessId, dto) {
        const shift = await this.requireOpenShift(businessId);
        const expected = await this.expectedCash(businessId, shift.id);
        const variance = Math.round((dto.countedCash - expected) * 100) / 100;
        if (Math.abs(variance) > cash_register_constants_1.VARIANCE_NOTE_THRESHOLD && !dto.note?.trim()) {
            throw new app_exception_1.AppException(cash_register_constants_1.CASH_REGISTER_ERROR_CODES.VARIANCE_NOTE_REQUIRED, `A variance of ${variance} needs a note before closing (threshold: ${cash_register_constants_1.VARIANCE_NOTE_THRESHOLD}).`, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.tenantPrisma.client.cashShift.update({
            where: { id: shift.id },
            data: {
                status: prisma_1.CashShiftStatus.closed,
                closedAt: new Date(),
                countedCash: dto.countedCash,
                variance,
                varianceNote: dto.note,
            },
        });
    }
    async expectedCash(businessId, shiftId) {
        const movements = await this.tenantPrisma.client.cashMovement.findMany({
            where: { businessId, shiftId },
        });
        const sign = {
            opening: 1,
            sale: 1,
            cash_in: 1,
            refund: -1,
            cash_out: -1,
        };
        const total = movements.reduce((sum, m) => sum + Number(m.amount) * sign[m.type], 0);
        return Math.round(total * 100) / 100;
    }
    async requireOpenShift(businessId) {
        const shift = await this.getCurrentShift(businessId);
        if (!shift) {
            throw new app_exception_1.AppException(cash_register_constants_1.CASH_REGISTER_ERROR_CODES.NO_OPEN_SHIFT, 'No open shift — open one first.', common_1.HttpStatus.BAD_REQUEST);
        }
        return shift;
    }
};
exports.CashRegisterService = CashRegisterService;
exports.CashRegisterService = CashRegisterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], CashRegisterService);
//# sourceMappingURL=cash-register.service.js.map