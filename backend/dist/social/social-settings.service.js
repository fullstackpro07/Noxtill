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
exports.SocialSettingsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
let SocialSettingsService = class SocialSettingsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async get(businessId) {
        const existing = await this.tenantPrisma.client.socialSettings.findUnique({
            where: { businessId },
        });
        return (existing ?? {
            id: null,
            businessId,
            autoPostRules: {},
            hashtagSets: {},
            brandVoice: null,
            createdAt: null,
            updatedAt: null,
        });
    }
    async update(businessId, dto) {
        return this.tenantPrisma.client.socialSettings.upsert({
            where: { businessId },
            create: { businessId, ...dto },
            update: { ...dto },
        });
    }
};
exports.SocialSettingsService = SocialSettingsService;
exports.SocialSettingsService = SocialSettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], SocialSettingsService);
//# sourceMappingURL=social-settings.service.js.map