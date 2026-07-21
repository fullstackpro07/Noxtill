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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const inventory_constants_1 = require("./inventory.constants");
const prisma_1 = require("../../generated/prisma");
let InventoryService = class InventoryService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async recordPurchase(businessId, dto) {
        const product = await this.tenantPrisma.client.product.findUnique({
            where: { id: dto.productId },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const [movement] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.stockMovement.create({
                data: {
                    businessId,
                    productId: dto.productId,
                    kind: 'purchase',
                    qty: dto.qty,
                    unitCost: dto.unitCost,
                    supplier: dto.supplier,
                },
            }),
            this.tenantPrisma.client.product.update({
                where: { id: dto.productId },
                data: { stockQty: { increment: dto.qty }, costPrice: dto.unitCost },
            }),
        ]);
        return movement;
    }
    async recordWastage(businessId, dto) {
        const product = await this.tenantPrisma.client.product.findUnique({
            where: { id: dto.productId },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (product.stockQty < dto.qty) {
            throw new app_exception_1.AppException(inventory_constants_1.INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK, `Cannot waste ${dto.qty} units — only ${product.stockQty} on hand`, common_1.HttpStatus.BAD_REQUEST);
        }
        const reason = dto.note ? `${dto.reason}: ${dto.note}` : dto.reason;
        const [movement] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.stockMovement.create({
                data: {
                    businessId,
                    productId: dto.productId,
                    kind: 'wastage',
                    qty: -dto.qty,
                    reason,
                },
            }),
            this.tenantPrisma.client.product.update({
                where: { id: dto.productId },
                data: { stockQty: { decrement: dto.qty } },
            }),
        ]);
        return movement;
    }
    async listInventory() {
        const products = await this.tenantPrisma.client.product.findMany({
            where: { kind: prisma_1.ProductKind.product },
            orderBy: { name: 'asc' },
        });
        const lastPurchases = await this.tenantPrisma.client.stockMovement.findMany({
            where: {
                productId: { in: products.map((p) => p.id) },
                kind: 'purchase',
            },
            orderBy: { createdAt: 'desc' },
        });
        const lastPurchaseMap = new Map();
        for (const movement of lastPurchases) {
            if (!lastPurchaseMap.has(movement.productId)) {
                lastPurchaseMap.set(movement.productId, movement.createdAt);
            }
        }
        return products.map((product) => ({
            id: product.id,
            name: product.name,
            stockQty: product.stockQty,
            lowStockThreshold: product.lowStockThreshold,
            stockValue: product.stockQty * Number(product.costPrice),
            lastPurchaseAt: lastPurchaseMap.get(product.id) ?? null,
            status: product.stockQty <= 0
                ? 'out_of_stock'
                : product.stockQty <= product.lowStockThreshold
                    ? 'low_stock'
                    : 'ok',
        }));
    }
    async getMovements(productId) {
        const product = await this.tenantPrisma.client.product.findUnique({
            where: { id: productId },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        return this.tenantPrisma.client.stockMovement.findMany({
            where: { productId },
            orderBy: { createdAt: 'desc' },
        });
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map