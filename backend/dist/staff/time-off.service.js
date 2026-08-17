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
exports.TimeOffService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
let TimeOffService = class TimeOffService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async create(businessId, dto) {
        let staffUserId = dto.staffUserId;
        if (!staffUserId) {
            const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
            const businessUser = await this.tenantPrisma.client.businessUser.findUnique({
                where: { businessId_userId: { businessId, userId: actorUserId } },
            });
            if (!businessUser) {
                throw new common_1.NotFoundException('Staff record not found for this account');
            }
            staffUserId = businessUser.id;
        }
        return this.tenantPrisma.client.timeOff.create({
            data: {
                businessId,
                staffUserId,
                startsAt: new Date(dto.startsAt),
                endsAt: new Date(dto.endsAt),
                reason: dto.reason,
            },
        });
    }
    list(staffUserId) {
        return this.tenantPrisma.client.timeOff.findMany({
            where: { staffUserId },
            orderBy: { startsAt: 'desc' },
            include: { staffUser: { include: { user: true } } },
        });
    }
    async approve(id) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        await this.findOne(id);
        return this.tenantPrisma.client.timeOff.update({
            where: { id },
            data: { approved: true, reviewedByUserId: actorUserId },
        });
    }
    async reject(id) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        await this.findOne(id);
        return this.tenantPrisma.client.timeOff.update({
            where: { id },
            data: { approved: false, reviewedByUserId: actorUserId },
        });
    }
    async findOne(id) {
        const row = await this.tenantPrisma.client.timeOff.findUnique({
            where: { id },
        });
        if (!row) {
            throw new common_1.NotFoundException('Time off request not found');
        }
        return row;
    }
};
exports.TimeOffService = TimeOffService;
exports.TimeOffService = TimeOffService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], TimeOffService);
//# sourceMappingURL=time-off.service.js.map