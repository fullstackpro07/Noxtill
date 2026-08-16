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
exports.ShiftsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const shifts_constants_1 = require("./shifts.constants");
const prisma_1 = require("../../generated/prisma");
let ShiftsService = class ShiftsService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    create(businessId, dto) {
        return this.tenantPrisma.client.staffShift.create({
            data: {
                businessId,
                staffUserId: dto.staffUserId,
                startsAt: new Date(dto.startsAt),
                endsAt: new Date(dto.endsAt),
                note: dto.note,
            },
        });
    }
    list(staffUserId, from, to) {
        return this.tenantPrisma.client.staffShift.findMany({
            where: {
                staffUserId,
                startsAt: from ? { gte: new Date(from) } : undefined,
                endsAt: to ? { lt: new Date(to) } : undefined,
            },
            orderBy: { startsAt: 'asc' },
            include: { staffUser: { include: { user: true } } },
        });
    }
    async findOne(id) {
        const shift = await this.tenantPrisma.client.staffShift.findUnique({
            where: { id },
            include: { staffUser: { include: { user: true } } },
        });
        if (!shift) {
            throw new common_1.NotFoundException('Shift not found');
        }
        return shift;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.staffShift.update({
            where: { id },
            data: {
                startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
                status: dto.status,
                note: dto.note,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.staffShift.delete({ where: { id } });
    }
    async requestSwap(businessId, id, dto) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const shift = await this.findOne(id);
        if (shift.swapStatus === prisma_1.ShiftSwapStatus.pending) {
            throw new app_exception_1.AppException(shifts_constants_1.SHIFT_ERROR_CODES.SWAP_ALREADY_REQUESTED, 'This shift already has a pending swap request', common_1.HttpStatus.CONFLICT);
        }
        const requestedBy = await this.tenantPrisma.client.businessUser.findUnique({
            where: { businessId_userId: { businessId, userId: actorUserId } },
        });
        return this.tenantPrisma.client.staffShift.update({
            where: { id },
            data: {
                swapStatus: prisma_1.ShiftSwapStatus.pending,
                swapRequestedByUserId: requestedBy?.id,
                swapCoveringUserId: dto.coveringUserId,
                swapReason: dto.reason,
                swapReviewedByUserId: null,
            },
        });
    }
    async approveSwap(businessId, id) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const shift = await this.findPendingSwap(id);
        if (!shift.swapCoveringUserId) {
            throw new app_exception_1.AppException(shifts_constants_1.SHIFT_ERROR_CODES.NO_COVERING_STAFF, 'This swap request has no covering staff member proposed yet', common_1.HttpStatus.BAD_REQUEST);
        }
        return this.tenantPrisma.client.$transaction(async (tx) => {
            const updated = await tx.staffShift.update({
                where: { id },
                data: {
                    swapStatus: prisma_1.ShiftSwapStatus.approved,
                    swapReviewedByUserId: actorUserId,
                    staffUserId: shift.swapCoveringUserId,
                },
            });
            await tx.auditLog.create({
                data: {
                    businessId,
                    actorUserId,
                    action: 'shift.swap_approve',
                    entity: 'StaffShift',
                    entityId: id,
                    after: updated,
                },
            });
            return updated;
        });
    }
    async rejectSwap(id) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        await this.findPendingSwap(id);
        return this.tenantPrisma.client.staffShift.update({
            where: { id },
            data: {
                swapStatus: prisma_1.ShiftSwapStatus.rejected,
                swapReviewedByUserId: actorUserId,
            },
        });
    }
    async findPendingSwap(id) {
        const shift = await this.findOne(id);
        if (shift.swapStatus !== prisma_1.ShiftSwapStatus.pending) {
            throw new app_exception_1.AppException(shifts_constants_1.SHIFT_ERROR_CODES.NO_SWAP_REQUEST, 'This shift has no pending swap request', common_1.HttpStatus.CONFLICT);
        }
        return shift;
    }
};
exports.ShiftsService = ShiftsService;
exports.ShiftsService = ShiftsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], ShiftsService);
//# sourceMappingURL=shifts.service.js.map