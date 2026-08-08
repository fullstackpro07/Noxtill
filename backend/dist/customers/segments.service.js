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
exports.SegmentsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const NEW_CUSTOMER_WINDOW_DAYS = 30;
let SegmentsService = class SegmentsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async getSegment(key) {
        const where = this.whereForKey(key);
        const members = await this.tenantPrisma.client.customer.findMany({
            where,
            orderBy: { name: 'asc' },
        });
        return { key, count: members.length, members };
    }
    whereForKey(key) {
        switch (key) {
            case 'all':
                return {};
            case 'vip':
                return { tags: { has: 'VIP' } };
            case 'lapsed':
                return { tags: { has: 'Lapsed' } };
            case 'new': {
                const since = new Date(Date.now() - NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
                return { createdAt: { gte: since } };
            }
            default:
                return { tags: { has: key } };
        }
    }
};
exports.SegmentsService = SegmentsService;
exports.SegmentsService = SegmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], SegmentsService);
//# sourceMappingURL=segments.service.js.map