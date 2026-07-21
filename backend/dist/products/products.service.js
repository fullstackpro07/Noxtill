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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
let ProductsService = class ProductsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    create(dto) {
        return this.tenantPrisma.client.product.create({
            data: {
                kind: dto.kind,
                name: dto.name,
                category: dto.category,
                variations: (dto.variations ?? []),
                costPrice: dto.costPrice,
                sellingPrice: dto.sellingPrice,
                stockQty: dto.stockQty ?? 0,
                lowStockThreshold: dto.lowStockThreshold ?? 5,
                durationMin: dto.kind === 'service' ? dto.durationMin : undefined,
                active: dto.active ?? true,
            },
        });
    }
    findAll(query) {
        const where = {
            kind: query.kind,
            category: query.category,
            active: query.active,
            name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
        };
        return this.tenantPrisma.client.product.findMany({
            where,
            orderBy: { name: 'asc' },
        });
    }
    async findOne(id) {
        const product = await this.tenantPrisma.client.product.findUnique({
            where: { id },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return product;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.product.update({
            where: { id },
            data: {
                kind: dto.kind,
                name: dto.name,
                category: dto.category,
                variations: dto.variations
                    ? dto.variations
                    : undefined,
                costPrice: dto.costPrice,
                sellingPrice: dto.sellingPrice,
                stockQty: dto.stockQty,
                lowStockThreshold: dto.lowStockThreshold,
                durationMin: dto.durationMin,
                active: dto.active,
            },
        });
    }
    async deactivate(id) {
        await this.findOne(id);
        return this.tenantPrisma.client.product.update({
            where: { id },
            data: { active: false },
        });
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map