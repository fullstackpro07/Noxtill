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
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../tenancy/tenant.constants");
let AuditService = class AuditService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async log(params) {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        if (!businessId) {
            return;
        }
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        await this.tenantPrisma.client.auditLog.create({
            data: {
                businessId,
                actorUserId,
                action: params.action,
                entity: params.entity,
                entityId: params.entityId,
                before: params.before === undefined
                    ? undefined
                    : params.before,
                after: params.after === undefined
                    ? undefined
                    : params.after,
            },
        });
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], AuditService);
//# sourceMappingURL=audit.service.js.map