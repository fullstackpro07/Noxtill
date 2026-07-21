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
exports.PublicOrderingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const order_totals_util_1 = require("../orders/order-totals.util");
const orders_constants_1 = require("../orders/orders.constants");
const prisma_1 = require("../../generated/prisma");
let PublicOrderingService = class PublicOrderingService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async resolveBusiness(slug) {
        const business = await this.prisma.business.findUnique({ where: { slug } });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        return business;
    }
    async getMenu(slug) {
        const business = await this.resolveBusiness(slug);
        const products = await this.prisma.product.findMany({
            where: { businessId: business.id, active: true },
            orderBy: { name: 'asc' },
        });
        return {
            business: {
                name: business.name,
                currency: business.currency,
                locale: business.locale,
                branding: business.branding,
            },
            products,
        };
    }
    async createOrder(slug, dto) {
        const business = await this.resolveBusiness(slug);
        return this.prisma.$transaction(async (tx) => {
            let customerId;
            if (dto.customerPhone) {
                const customer = await tx.customer.upsert({
                    where: {
                        businessId_phone: {
                            businessId: business.id,
                            phone: dto.customerPhone,
                        },
                    },
                    create: {
                        businessId: business.id,
                        phone: dto.customerPhone,
                        name: dto.customerName ?? dto.customerPhone,
                    },
                    update: {},
                });
                customerId = customer.id;
            }
            const productIds = [...new Set(dto.items.map((i) => i.productId))];
            const products = await tx.product.findMany({
                where: { id: { in: productIds }, businessId: business.id },
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
                    price: Number(product.sellingPrice),
                    cost: Number(product.costPrice),
                    qty: item.qty,
                };
            });
            const { subtotal, tax, total, cogs } = (0, order_totals_util_1.computeOrderTotals)(itemsData, 0, Number(business.taxRate));
            const [{ next: orderNo }] = await tx.$queryRaw `
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${business.id}
      `;
            const order = await tx.order.create({
                data: {
                    businessId: business.id,
                    orderNo,
                    customerId,
                    orderType: dto.orderType ?? 'online',
                    tableNo: dto.tableNo,
                    status: prisma_1.OrderStatus.pending,
                    subtotal,
                    tax,
                    discount: 0,
                    total,
                    cogs,
                },
            });
            await tx.orderItem.createMany({
                data: itemsData.map((item) => ({
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
exports.PublicOrderingService = PublicOrderingService;
exports.PublicOrderingService = PublicOrderingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PublicOrderingService);
//# sourceMappingURL=public-ordering.service.js.map