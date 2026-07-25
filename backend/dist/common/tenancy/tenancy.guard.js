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
exports.TenancyGuard = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const prisma_service_1 = require("../../prisma/prisma.service");
const tenant_constants_1 = require("./tenant.constants");
let TenancyGuard = class TenancyGuard {
    cls;
    prisma;
    constructor(cls, prisma) {
        this.cls = cls;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user) {
            const businessId = await this.resolveBranchId(request, user.businessId);
            this.cls.set(tenant_constants_1.CLS_KEY_BUSINESS_ID, businessId);
            this.cls.set(tenant_constants_1.CLS_KEY_USER_ID, user.sub);
            this.cls.set(tenant_constants_1.CLS_KEY_ROLE, user.role);
        }
        return true;
    }
    async resolveBranchId(request, ownBusinessId) {
        const requested = request.headers['x-branch'] ??
            request.query?.branch;
        if (!requested || requested === ownBusinessId) {
            return ownBusinessId;
        }
        const branch = await this.prisma.business.findUnique({
            where: { id: requested },
        });
        return branch && branch.parentId === ownBusinessId
            ? branch.id
            : ownBusinessId;
    }
};
exports.TenancyGuard = TenancyGuard;
exports.TenancyGuard = TenancyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nestjs_cls_1.ClsService,
        prisma_service_1.PrismaService])
], TenancyGuard);
//# sourceMappingURL=tenancy.guard.js.map