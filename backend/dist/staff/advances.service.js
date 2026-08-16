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
exports.AdvancesService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const advances_constants_1 = require("./advances.constants");
const prisma_1 = require("../../generated/prisma");
let AdvancesService = class AdvancesService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    create(businessId, staffUserId, dto) {
        return this.tenantPrisma.client.staffAdvance.create({
            data: {
                businessId,
                staffUserId,
                amount: dto.amount,
                reason: dto.reason,
            },
        });
    }
    list(staffUserId) {
        return this.tenantPrisma.client.staffAdvance.findMany({
            where: { staffUserId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async update(id, dto) {
        const advance = await this.findOutstanding(id);
        return this.tenantPrisma.client.staffAdvance.update({
            where: { id: advance.id },
            data: { amount: dto.amount, reason: dto.reason },
        });
    }
    async cancel(id) {
        const advance = await this.findOutstanding(id);
        return this.tenantPrisma.client.staffAdvance.update({
            where: { id: advance.id },
            data: { status: prisma_1.StaffAdvanceStatus.cancelled },
        });
    }
    async findOutstanding(id) {
        const advance = await this.tenantPrisma.client.staffAdvance.findUnique({
            where: { id },
        });
        if (!advance) {
            throw new common_1.NotFoundException('Advance not found');
        }
        if (advance.status !== prisma_1.StaffAdvanceStatus.outstanding) {
            throw new app_exception_1.AppException(advances_constants_1.ADVANCE_ERROR_CODES.NOT_OUTSTANDING, `Advance is already "${advance.status}"`, common_1.HttpStatus.CONFLICT);
        }
        return advance;
    }
};
exports.AdvancesService = AdvancesService;
exports.AdvancesService = AdvancesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], AdvancesService);
//# sourceMappingURL=advances.service.js.map