"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommonModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const tenancy_guard_1 = require("./tenancy/tenancy.guard");
const roles_guard_1 = require("./guards/roles.guard");
const business_throttler_guard_1 = require("./guards/business-throttler.guard");
const http_exception_filter_1 = require("./filters/http-exception.filter");
const audit_interceptor_1 = require("./interceptors/audit.interceptor");
const audit_service_1 = require("./audit/audit.service");
const webhook_idempotency_service_1 = require("./webhooks/webhook-idempotency.service");
let CommonModule = class CommonModule {
};
exports.CommonModule = CommonModule;
exports.CommonModule = CommonModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [throttler_1.ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
        providers: [
            audit_service_1.AuditService,
            webhook_idempotency_service_1.WebhookIdempotencyService,
            { provide: core_1.APP_GUARD, useClass: business_throttler_guard_1.BusinessThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
            { provide: core_1.APP_GUARD, useClass: tenancy_guard_1.TenancyGuard },
            { provide: core_1.APP_GUARD, useClass: roles_guard_1.RolesGuard },
            { provide: core_1.APP_INTERCEPTOR, useClass: audit_interceptor_1.AuditInterceptor },
            { provide: core_1.APP_FILTER, useClass: http_exception_filter_1.HttpExceptionFilter },
        ],
        exports: [audit_service_1.AuditService, webhook_idempotency_service_1.WebhookIdempotencyService],
    })
], CommonModule);
//# sourceMappingURL=common.module.js.map