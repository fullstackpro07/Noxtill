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
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const send_gate_service_1 = require("../messaging/send-gate.service");
const review_requests_service_1 = require("../reviews/review-requests.service");
const review_token_util_1 = require("../reviews/review-token.util");
const orders_constants_1 = require("./orders.constants");
const order_totals_util_1 = require("./order-totals.util");
const prisma_1 = require("../../generated/prisma");
let OrdersService = class OrdersService {
    tenantPrisma;
    cls;
    sendGate;
    reviewRequests;
    constructor(tenantPrisma, cls, sendGate, reviewRequests) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.sendGate = sendGate;
        this.reviewRequests = reviewRequests;
    }
    async createSale(businessId, dto) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const { order, reviewToken, reviewCustomerId } = await this.tenantPrisma.client.$transaction(async (tx) => {
            const business = await tx.business.findUniqueOrThrow({
                where: { id: businessId },
            });
            let customerId = dto.customerId;
            if (!customerId && dto.customerPhone) {
                const customer = await tx.customer.upsert({
                    where: {
                        businessId_phone: { businessId, phone: dto.customerPhone },
                    },
                    create: {
                        businessId,
                        phone: dto.customerPhone,
                        name: dto.customerName ?? dto.customerPhone,
                    },
                    update: {},
                });
                customerId = customer.id;
            }
            if (dto.payment.method === 'credit' && !customerId) {
                throw new app_exception_1.AppException(orders_constants_1.ORDER_ERROR_CODES.CREDIT_REQUIRES_CUSTOMER, 'Credit sales require a customer', common_1.HttpStatus.BAD_REQUEST);
            }
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
                if (product.kind === prisma_1.ProductKind.product &&
                    product.stockQty < item.qty) {
                    throw new app_exception_1.AppException(orders_constants_1.ORDER_ERROR_CODES.INSUFFICIENT_STOCK, `Insufficient stock for "${product.name}" (have ${product.stockQty}, need ${item.qty})`, common_1.HttpStatus.BAD_REQUEST);
                }
                const price = item.priceOverride ?? Number(product.sellingPrice);
                const cost = Number(product.costPrice);
                return {
                    productId: product.id,
                    name: product.name,
                    price,
                    cost,
                    qty: item.qty,
                    kind: product.kind,
                };
            });
            const discount = dto.discount ?? 0;
            const { subtotal, tax, total, cogs } = (0, order_totals_util_1.computeOrderTotals)(itemsData, discount, Number(business.taxRate));
            const [{ next: orderNo }] = await tx.$queryRaw `
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
            const order = await tx.order.create({
                data: {
                    businessId,
                    orderNo,
                    customerId,
                    orderType: dto.orderType ?? 'counter',
                    tableNo: dto.tableNo,
                    status: prisma_1.OrderStatus.completed,
                    subtotal,
                    tax,
                    discount,
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
            for (const item of itemsData) {
                if (item.kind === prisma_1.ProductKind.product) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stockQty: { decrement: item.qty } },
                    });
                    await tx.stockMovement.create({
                        data: {
                            businessId,
                            productId: item.productId,
                            kind: 'sale',
                            qty: -item.qty,
                            unitCost: item.cost,
                        },
                    });
                }
            }
            if (dto.payment.method === 'credit') {
                await tx.creditEntry.create({
                    data: {
                        businessId,
                        customerId: customerId,
                        kind: 'credit',
                        amount: total,
                        note: dto.payment.note ?? 'Sale on credit',
                        orderId: order.id,
                    },
                });
            }
            else {
                await tx.payment.create({
                    data: {
                        orderId: order.id,
                        method: dto.payment.method,
                        amount: dto.payment.amount ?? total,
                    },
                });
            }
            if (customerId) {
                await tx.customer.update({
                    where: { id: customerId },
                    data: {
                        lifetimeSpend: { increment: total },
                        visitCount: { increment: 1 },
                        lastVisitAt: new Date(),
                    },
                });
            }
            await tx.auditLog.create({
                data: {
                    businessId,
                    actorUserId,
                    action: 'sale.create',
                    entity: 'Order',
                    entityId: order.id,
                    after: order,
                },
            });
            let reviewToken;
            if (customerId) {
                reviewToken = (0, review_token_util_1.generateReviewToken)();
                await tx.reviewRequest.create({
                    data: {
                        businessId,
                        customerId,
                        token: reviewToken,
                        source: 'order',
                        sourceId: order.id,
                    },
                });
            }
            return { order, reviewToken, reviewCustomerId: customerId };
        });
        if (reviewToken && reviewCustomerId) {
            await this.reviewRequests.scheduleSend(businessId, reviewCustomerId, reviewToken);
        }
        return order;
    }
    async updateStatus(businessId, orderId, nextStatus) {
        const order = await this.tenantPrisma.client.order.findUnique({
            where: { id: orderId },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        const allowed = orders_constants_1.ORDER_STATUS_TRANSITIONS[order.status];
        if (!allowed.includes(nextStatus)) {
            throw new app_exception_1.AppException(orders_constants_1.ORDER_ERROR_CODES.INVALID_STATUS_TRANSITION, `Cannot move an order from "${order.status}" to "${nextStatus}"`, common_1.HttpStatus.BAD_REQUEST);
        }
        const updated = await this.tenantPrisma.client.order.update({
            where: { id: orderId },
            data: { status: nextStatus },
        });
        if (updated.customerId) {
            await this.sendGate
                .send({
                businessId,
                customerId: updated.customerId,
                templateKey: 'order_status',
                variables: { orderNo: String(updated.orderNo), status: nextStatus },
            })
                .catch(() => undefined);
        }
        return updated;
    }
    async findOne(id) {
        const order = await this.tenantPrisma.client.order.findUnique({
            where: { id },
            include: { items: true, payments: true },
        });
        if (!order) {
            throw new common_1.NotFoundException('Order not found');
        }
        return order;
    }
    findAll(status) {
        return this.tenantPrisma.client.order.findMany({
            where: { status, isQuotation: false },
            orderBy: { createdAt: 'desc' },
            include: { items: true },
        });
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        send_gate_service_1.SendGateService,
        review_requests_service_1.ReviewRequestsService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map