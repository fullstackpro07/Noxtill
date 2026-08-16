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
exports.SuppliersService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const activity_service_1 = require("../activity/activity.service");
let SuppliersService = class SuppliersService {
    tenantPrisma;
    activity;
    constructor(tenantPrisma, activity) {
        this.tenantPrisma = tenantPrisma;
        this.activity = activity;
    }
    create(dto) {
        return this.tenantPrisma.client.supplier.create({
            data: dto,
        });
    }
    findAll() {
        return this.tenantPrisma.client.supplier.findMany({
            orderBy: { name: 'asc' },
        });
    }
    async findOne(id) {
        const supplier = await this.tenantPrisma.client.supplier.findUnique({
            where: { id },
        });
        if (!supplier) {
            throw new common_1.NotFoundException('Supplier not found');
        }
        return supplier;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.supplier.update({
            where: { id },
            data: dto,
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.supplier.delete({ where: { id } });
    }
    async quickPurchaseOrder(businessId, supplierId, dto) {
        const supplier = await this.findOne(supplierId);
        const productIds = [...new Set(dto.items.map((i) => i.productId))];
        const products = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: productIds } },
        });
        if (products.length !== productIds.length) {
            throw new common_1.NotFoundException('One or more products were not found');
        }
        const productById = new Map(products.map((p) => [p.id, p]));
        const movementCreates = dto.items.map((item) => this.tenantPrisma.client.stockMovement.create({
            data: {
                businessId,
                productId: item.productId,
                kind: 'purchase',
                qty: item.qty,
                unitCost: item.unitCost,
                supplierId,
            },
        }));
        const productUpdates = dto.items.map((item) => this.tenantPrisma.client.product.update({
            where: { id: item.productId },
            data: {
                stockQty: { increment: item.qty },
                costPrice: item.unitCost,
            },
        }));
        const results = await this.tenantPrisma.client.$transaction([
            ...movementCreates,
            ...productUpdates,
        ]);
        const createdMovements = results.slice(0, dto.items.length);
        const totalUnits = dto.items.reduce((sum, i) => sum + i.qty, 0);
        await this.activity.record(businessId, {
            type: 'stock',
            description: `Purchase order from ${supplier.name}: ${dto.items.length} product(s), ${totalUnits} unit(s)`,
            entityType: 'Supplier',
            entityId: supplier.id,
        });
        return {
            supplierId,
            lines: dto.items.map((item, i) => ({
                productId: item.productId,
                productName: productById.get(item.productId).name,
                qty: item.qty,
                unitCost: item.unitCost,
                stockMovementId: createdMovements[i]?.id,
            })),
        };
    }
};
exports.SuppliersService = SuppliersService;
exports.SuppliersService = SuppliersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        activity_service_1.ActivityService])
], SuppliersService);
//# sourceMappingURL=suppliers.service.js.map