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
exports.WidgetsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const app_exception_1 = require("../common/filters/app.exception");
const widget_registry_1 = require("./widget-registry");
const widgets_constants_1 = require("./widgets.constants");
let WidgetsService = class WidgetsService {
    tenantPrisma;
    cls;
    cache = new Map();
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    listRegistry() {
        return widget_registry_1.WIDGET_REGISTRY.map((w) => ({
            key: w.key,
            title: w.title,
            category: w.category,
        }));
    }
    async getWidgetData(key) {
        const widget = (0, widget_registry_1.findWidget)(key);
        if (!widget) {
            throw new app_exception_1.AppException(widgets_constants_1.WIDGET_ERROR_CODES.WIDGET_NOT_FOUND, `Unknown widget: ${key}`, common_1.HttpStatus.NOT_FOUND);
        }
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const cacheKey = `${businessId}:${key}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }
        const value = await widget.resolve({
            businessId,
            tenantPrisma: this.tenantPrisma,
        });
        this.cache.set(cacheKey, {
            value,
            expiresAt: Date.now() + widgets_constants_1.WIDGET_CACHE_TTL_MS,
        });
        return value;
    }
};
exports.WidgetsService = WidgetsService;
exports.WidgetsService = WidgetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], WidgetsService);
//# sourceMappingURL=widgets.service.js.map