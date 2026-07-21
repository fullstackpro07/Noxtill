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
exports.QuotationsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const order_totals_util_1 = require("../orders/order-totals.util");
const orders_constants_1 = require("../orders/orders.constants");
const prisma_1 = require("../../generated/prisma");
let QuotationsService = class QuotationsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async create(businessId, dto) {
        return this.tenantPrisma.client.$transaction(async (tx) => {
            let customerId = dto.customerId;
            if (!customerId && dto.customerPhone) {
                const customer = await tx.customer.upsert({
                    where: { businessId_phone: { businessId, phone: dto.customerPhone } },
                    create: {
                        businessId,
                        phone: dto.customerPhone,
                        name: dto.customerName ?? dto.customerPhone,
                    },
                    update: {},
                });
                customerId = customer.id;
            }
            const business = await tx.business.findUniqueOrThrow({
                where: { id: businessId },
            });
            const productIds = [...new Set(dto.items.map((i) => i.productId))];
            const products = await tx.product.findMany({
                where: { id: { in: productIds } },
            });
            const productMap = new Map(products.map((p) => [p.id, p]));
            const itemsData = dto.items.map((item) => {
                const product = productMap.get(item.productId);
                if (!product) {
                    throw new app_exception_1.AppException(orders_constants_1.ORDER_ERROR_CODES.PRODUCT_NOT_FOUND, `Product ${item.productId} not found`, common_1.HttpStatus.BAD_REQUEST);
                }
                return {
                    productId: product.id,
                    name: product.name,
                    price: item.priceOverride ?? Number(product.sellingPrice),
                    cost: Number(product.costPrice),
                    qty: item.qty,
                };
            });
            const discount = dto.discount ?? 0;
            const { subtotal, tax, total, cogs } = (0, order_totals_util_1.computeOrderTotals)(itemsData, discount, Number(business.taxRate));
            const [{ next: orderNo }] = await tx.$queryRaw `
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
            const quotation = await tx.order.create({
                data: {
                    businessId,
                    orderNo,
                    customerId,
                    orderType: 'quotation',
                    status: prisma_1.OrderStatus.pending,
                    isQuotation: true,
                    subtotal,
                    tax,
                    discount,
                    total,
                    cogs,
                },
            });
            await tx.orderItem.createMany({
                data: itemsData.map((item) => ({
                    orderId: quotation.id,
                    productId: item.productId,
                    name: item.name,
                    price: item.price,
                    cost: item.cost,
                    qty: item.qty,
                })),
            });
            return quotation;
        });
    }
    async convert(businessId, quotationId) {
        return this.tenantPrisma.client.$transaction(async (tx) => {
            const quotation = await tx.order.findUnique({
                where: { id: quotationId },
                include: { items: true },
            });
            if (!quotation || !quotation.isQuotation) {
                throw new common_1.NotFoundException('Quotation not found');
            }
            const [{ next: orderNo }] = await tx.$queryRaw `
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
            const order = await tx.order.create({
                data: {
                    businessId,
                    orderNo,
                    customerId: quotation.customerId,
                    orderType: 'counter',
                    status: prisma_1.OrderStatus.pending,
                    isQuotation: false,
                    subtotal: quotation.subtotal,
                    tax: quotation.tax,
                    discount: quotation.discount,
                    total: quotation.total,
                    cogs: quotation.cogs,
                },
            });
            await tx.orderItem.createMany({
                data: quotation.items.map((item) => ({
                    orderId: order.id,
                    productId: item.productId,
                    name: item.name,
                    price: item.price,
                    cost: item.cost,
                    qty: item.qty,
                })),
            });
            return order;
        });
    }
};
exports.QuotationsService = QuotationsService;
exports.QuotationsService = QuotationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], QuotationsService);
//# sourceMappingURL=quotations.service.js.map