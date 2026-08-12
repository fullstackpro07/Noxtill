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
exports.HeldSalesService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const orders_service_1 = require("./orders.service");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let HeldSalesService = class HeldSalesService {
    tenantPrisma;
    cls;
    ordersService;
    constructor(tenantPrisma, cls, ordersService) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.ordersService = ordersService;
    }
    async hold(businessId, dto) {
        const heldByUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const { note, ...cart } = dto;
        return this.tenantPrisma.client.heldSale.create({
            data: {
                businessId,
                cart: cart,
                heldByUserId,
                note,
            },
        });
    }
    async list(businessId) {
        const rows = await this.tenantPrisma.client.heldSale.findMany({
            where: { businessId },
            orderBy: { createdAt: 'asc' },
        });
        const productIds = new Set();
        for (const row of rows) {
            const cart = row.cart;
            for (const item of cart.items)
                productIds.add(item.productId);
        }
        const products = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            select: { id: true, sellingPrice: true },
        });
        const priceById = new Map(products.map((p) => [p.id, Number(p.sellingPrice)]));
        return rows.map((row) => {
            const cart = row.cart;
            const estimatedTotal = round2(cart.items.reduce((sum, item) => {
                const price = item.priceOverride ?? priceById.get(item.productId) ?? 0;
                return sum + price * item.qty;
            }, 0) - (cart.discount ?? 0));
            return { ...row, cart, estimatedTotal };
        });
    }
    async discard(businessId, id) {
        const held = await this.tenantPrisma.client.heldSale.findUnique({
            where: { id },
        });
        if (!held || held.businessId !== businessId) {
            throw new common_1.NotFoundException('Held sale not found');
        }
        await this.tenantPrisma.client.heldSale.delete({ where: { id } });
    }
    async resume(businessId, id, dto) {
        const held = await this.tenantPrisma.client.heldSale.findUnique({
            where: { id },
        });
        if (!held || held.businessId !== businessId) {
            throw new common_1.NotFoundException('Held sale not found');
        }
        const cart = held.cart;
        const saleDto = { ...cart, payment: dto.payment };
        const order = await this.ordersService.createSale(businessId, saleDto);
        await this.tenantPrisma.client.heldSale.delete({ where: { id } });
        return order;
    }
};
exports.HeldSalesService = HeldSalesService;
exports.HeldSalesService = HeldSalesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        orders_service_1.OrdersService])
], HeldSalesService);
//# sourceMappingURL=held-sales.service.js.map