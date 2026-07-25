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
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const widgets_service_1 = require("../widgets/widgets.service");
const dashboard_constants_1 = require("./dashboard.constants");
let DashboardService = class DashboardService {
    tenantPrisma;
    widgetsService;
    constructor(tenantPrisma, widgetsService) {
        this.tenantPrisma = tenantPrisma;
        this.widgetsService = widgetsService;
    }
    async getConfig(businessId) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        return business.dashboardConfig;
    }
    async updateConfig(businessId, dto) {
        await this.tenantPrisma.client.business.update({
            where: { id: businessId },
            data: { dashboardConfig: dto.config },
        });
        return dto.config;
    }
    async today() {
        const entries = await Promise.all(dashboard_constants_1.DASHBOARD_TODAY_WIDGET_KEYS.map(async (key) => [key, await this.widgetsService.getWidgetData(key)]));
        return Object.fromEntries(entries);
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        widgets_service_1.WidgetsService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map