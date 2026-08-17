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
exports.CustomRolesService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const roles_constants_1 = require("./roles.constants");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
const prisma_1 = require("../../generated/prisma");
let CustomRolesService = class CustomRolesService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async create(businessId, dto) {
        this.assertKnownCapabilities(dto.capabilities);
        try {
            return await this.tenantPrisma.client.customRole.create({
                data: {
                    businessId,
                    name: dto.name,
                    capabilities: dto.capabilities,
                },
            });
        }
        catch (err) {
            if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                throw new app_exception_1.AppException(roles_constants_1.CUSTOM_ROLE_ERROR_CODES.DUPLICATE_NAME, `A role named "${dto.name}" already exists`, common_1.HttpStatus.CONFLICT);
            }
            throw err;
        }
    }
    list() {
        return this.tenantPrisma.client.customRole.findMany({
            orderBy: { createdAt: 'asc' },
        });
    }
    async findOne(id) {
        const role = await this.tenantPrisma.client.customRole.findUnique({
            where: { id },
        });
        if (!role) {
            throw new common_1.NotFoundException('Custom role not found');
        }
        return role;
    }
    async update(id, dto) {
        await this.findOne(id);
        if (dto.capabilities) {
            this.assertKnownCapabilities(dto.capabilities);
        }
        return this.tenantPrisma.client.customRole.update({
            where: { id },
            data: { name: dto.name, capabilities: dto.capabilities },
        });
    }
    async remove(id) {
        await this.findOne(id);
        const assignedCount = await this.tenantPrisma.client.businessUser.count({
            where: { customRoleId: id },
        });
        if (assignedCount > 0) {
            throw new app_exception_1.AppException(roles_constants_1.CUSTOM_ROLE_ERROR_CODES.IN_USE, `${assignedCount} staff member(s) still have this role — reassign them first`, common_1.HttpStatus.CONFLICT);
        }
        await this.tenantPrisma.client.customRole.delete({ where: { id } });
    }
    assertKnownCapabilities(capabilities) {
        const unknown = capabilities.filter((c) => !capabilities_constants_1.ALL_CAPABILITIES.includes(c));
        if (unknown.length > 0) {
            throw new app_exception_1.AppException(roles_constants_1.CUSTOM_ROLE_ERROR_CODES.UNKNOWN_CAPABILITY, `Unknown capability key(s): ${unknown.join(', ')}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.CustomRolesService = CustomRolesService;
exports.CustomRolesService = CustomRolesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], CustomRolesService);
//# sourceMappingURL=custom-roles.service.js.map