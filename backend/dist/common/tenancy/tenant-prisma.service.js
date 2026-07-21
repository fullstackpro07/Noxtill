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
exports.TenantPrismaService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const prisma_service_1 = require("../../prisma/prisma.service");
const tenant_prisma_extension_1 = require("./tenant-prisma.extension");
function extendClient(prisma, cls) {
    return prisma.$extends((0, tenant_prisma_extension_1.tenantScopingExtension)(cls));
}
let TenantPrismaService = class TenantPrismaService {
    client;
    constructor(prisma, cls) {
        this.client = extendClient(prisma, cls);
    }
};
exports.TenantPrismaService = TenantPrismaService;
exports.TenantPrismaService = TenantPrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, nestjs_cls_1.ClsService])
], TenantPrismaService);
//# sourceMappingURL=tenant-prisma.service.js.map