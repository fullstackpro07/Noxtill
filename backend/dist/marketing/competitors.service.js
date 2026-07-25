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
exports.CompetitorsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const marketing_constants_1 = require("./marketing.constants");
let CompetitorsService = class CompetitorsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    list() {
        return this.tenantPrisma.client.competitor.findMany({
            orderBy: { createdAt: 'asc' },
        });
    }
    async create(businessId, dto) {
        const count = await this.tenantPrisma.client.competitor.count();
        if (count >= marketing_constants_1.MAX_COMPETITORS) {
            throw new app_exception_1.AppException(marketing_constants_1.MARKETING_ERROR_CODES.COMPETITOR_LIMIT_REACHED, `You can track at most ${marketing_constants_1.MAX_COMPETITORS} competitors`, common_1.HttpStatus.FORBIDDEN);
        }
        return this.tenantPrisma.client.competitor.create({
            data: {
                businessId,
                platformRef: dto.platformRef,
            },
        });
    }
    async remove(id) {
        const existing = await this.tenantPrisma.client.competitor.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Competitor not found');
        }
        await this.tenantPrisma.client.competitor.delete({ where: { id } });
        return { success: true };
    }
};
exports.CompetitorsService = CompetitorsService;
exports.CompetitorsService = CompetitorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], CompetitorsService);
//# sourceMappingURL=competitors.service.js.map