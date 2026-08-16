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
exports.VariantsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
let VariantsService = class VariantsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    create(dto) {
        return this.tenantPrisma.client.variantSet.create({
            data: {
                name: dto.name,
                options: { create: dto.options },
            },
            include: { options: true },
        });
    }
    findAll() {
        return this.tenantPrisma.client.variantSet.findMany({
            orderBy: { name: 'asc' },
            include: { options: true },
        });
    }
    async findOne(id) {
        const set = await this.tenantPrisma.client.variantSet.findUnique({
            where: { id },
            include: { options: true },
        });
        if (!set) {
            throw new common_1.NotFoundException('Variant set not found');
        }
        return set;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.$transaction(async (tx) => {
            if (dto.options) {
                await tx.variantOption.deleteMany({ where: { variantSetId: id } });
            }
            return tx.variantSet.update({
                where: { id },
                data: {
                    name: dto.name,
                    options: dto.options ? { create: dto.options } : undefined,
                },
                include: { options: true },
            });
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.variantOption.deleteMany({
            where: { variantSetId: id },
        });
        await this.tenantPrisma.client.variantSet.delete({ where: { id } });
    }
    async apply(id, dto) {
        const set = await this.findOne(id);
        const stamped = {
            label: set.name,
            options: set.options.map((o) => ({
                name: o.name,
                priceOverride: o.priceOverride === null ? undefined : Number(o.priceOverride),
            })),
        };
        const products = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: dto.productIds } },
        });
        if (products.length !== dto.productIds.length) {
            throw new common_1.NotFoundException('One or more products were not found');
        }
        const updated = await Promise.all(products.map((product) => {
            const existing = product.variations ?? [];
            const next = [
                ...existing.filter((v) => v.label !== stamped.label),
                stamped,
            ];
            return this.tenantPrisma.client.product.update({
                where: { id: product.id },
                data: { variations: next },
            });
        }));
        return updated;
    }
};
exports.VariantsService = VariantsService;
exports.VariantsService = VariantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], VariantsService);
//# sourceMappingURL=variants.service.js.map