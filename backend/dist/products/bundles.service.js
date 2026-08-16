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
exports.BundlesService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let BundlesService = class BundlesService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async create(dto) {
        const productIds = [...new Set(dto.items.map((i) => i.productId))];
        const components = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: productIds } },
        });
        if (components.length !== productIds.length) {
            throw new common_1.NotFoundException('One or more component products were not found');
        }
        const componentById = new Map(components.map((p) => [p.id, p]));
        const costPrice = round2(dto.items.reduce((sum, item) => sum + Number(componentById.get(item.productId).costPrice) * item.qty, 0));
        return this.tenantPrisma.client.$transaction(async (tx) => {
            const product = await tx.product.create({
                data: {
                    kind: 'product',
                    name: dto.name,
                    sku: dto.sku,
                    costPrice,
                    sellingPrice: dto.sellingPrice,
                    stockQty: 0,
                },
            });
            return tx.bundle.create({
                data: {
                    productId: product.id,
                    items: { create: dto.items },
                },
                include: { items: { include: { product: true } }, product: true },
            });
        });
    }
    findAll() {
        return this.tenantPrisma.client.bundle.findMany({
            orderBy: { createdAt: 'desc' },
            include: { items: { include: { product: true } }, product: true },
        });
    }
    async findOne(id) {
        const bundle = await this.tenantPrisma.client.bundle.findUnique({
            where: { id },
            include: { items: { include: { product: true } }, product: true },
        });
        if (!bundle) {
            throw new common_1.NotFoundException('Bundle not found');
        }
        return bundle;
    }
    async remove(id) {
        const bundle = await this.findOne(id);
        await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.bundleItem.deleteMany({
                where: { bundleId: id },
            }),
            this.tenantPrisma.client.bundle.delete({ where: { id } }),
            this.tenantPrisma.client.product.update({
                where: { id: bundle.productId },
                data: { active: false },
            }),
        ]);
    }
};
exports.BundlesService = BundlesService;
exports.BundlesService = BundlesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], BundlesService);
//# sourceMappingURL=bundles.service.js.map