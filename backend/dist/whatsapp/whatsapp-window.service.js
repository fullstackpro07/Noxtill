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
exports.WhatsappWindowService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const WINDOW_HOURS = 24;
let WhatsappWindowService = class WhatsappWindowService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async refresh(businessId, customerId) {
        const expiresAt = new Date(Date.now() + WINDOW_HOURS * 60 * 60 * 1000);
        await this.tenantPrisma.client.whatsappWindow.upsert({
            where: { businessId_customerId: { businessId, customerId } },
            create: { businessId, customerId, expiresAt },
            update: { expiresAt },
        });
    }
    async isOpen(businessId, customerId) {
        const window = await this.tenantPrisma.client.whatsappWindow.findFirst({
            where: { businessId, customerId },
        });
        return !!window && window.expiresAt > new Date();
    }
};
exports.WhatsappWindowService = WhatsappWindowService;
exports.WhatsappWindowService = WhatsappWindowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], WhatsappWindowService);
//# sourceMappingURL=whatsapp-window.service.js.map