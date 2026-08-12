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
exports.ReturnsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const cash_register_service_1 = require("../cash-register/cash-register.service");
const billing_service_1 = require("../billing/billing.service");
const returns_constants_1 = require("./returns.constants");
const prisma_1 = require("../../generated/prisma");
let ReturnsService = class ReturnsService {
    tenantPrisma;
    cls;
    cashRegister;
    billing;
    constructor(tenantPrisma, cls, cashRegister, billing) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.cashRegister = cashRegister;
        this.billing = billing;
    }
    async create(businessId, dto) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const order = await this.tenantPrisma.client.order.findUnique({
            where: { id: dto.orderId },
            include: {
                items: true,
                returns: {
                    where: { status: { not: prisma_1.ReturnStatus.rejected } },
                    include: { items: true },
                },
            },
        });
        if (!order || order.businessId !== businessId) {
            throw new common_1.NotFoundException('Order not found');
        }
        if ((dto.refundMethod === 'credit' || dto.refundMethod === 'store_credit') &&
            !order.customerId) {
            throw new app_exception_1.AppException(returns_constants_1.RETURN_ERROR_CODES.CUSTOMER_REQUIRED, 'A credit/store-credit refund requires the order to have a customer', common_1.HttpStatus.BAD_REQUEST);
        }
        const alreadyReturned = new Map();
        for (const ret of order.returns) {
            for (const item of ret.items) {
                alreadyReturned.set(item.productId, (alreadyReturned.get(item.productId) ?? 0) + item.qty);
            }
        }
        const orderItemByProduct = new Map(order.items
            .filter((i) => i.productId)
            .map((i) => [i.productId, i]));
        let refundAmount = 0;
        const itemsData = dto.items.map((item) => {
            const orderItem = orderItemByProduct.get(item.productId);
            if (!orderItem) {
                throw new app_exception_1.AppException(returns_constants_1.RETURN_ERROR_CODES.ITEM_NOT_IN_ORDER, `Product ${item.productId} was not part of order ${order.id}`, common_1.HttpStatus.BAD_REQUEST);
            }
            const returnedSoFar = alreadyReturned.get(item.productId) ?? 0;
            if (returnedSoFar + item.qty > orderItem.qty) {
                throw new app_exception_1.AppException(returns_constants_1.RETURN_ERROR_CODES.QTY_EXCEEDS_SOLD, `Cannot return ${item.qty} of "${orderItem.name}" — only ${orderItem.qty - returnedSoFar} left returnable`, common_1.HttpStatus.BAD_REQUEST);
            }
            const amount = Math.round(Number(orderItem.price) * item.qty * 100) / 100;
            refundAmount += amount;
            return { productId: item.productId, qty: item.qty, amount };
        });
        refundAmount = Math.round(refundAmount * 100) / 100;
        return this.tenantPrisma.client.return.create({
            data: {
                businessId,
                orderId: order.id,
                customerId: order.customerId,
                reason: dto.reason,
                refundMethod: dto.refundMethod,
                refundAmount,
                restock: dto.restock ?? true,
                requestedByUserId: actorUserId,
                items: { create: itemsData },
            },
            include: { items: true },
        });
    }
    async list(businessId, status) {
        return this.tenantPrisma.client.return.findMany({
            where: { businessId, status },
            orderBy: { createdAt: 'desc' },
            include: { items: true, order: true, customer: true },
        });
    }
    async approve(businessId, id) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const ret = await this.findPending(businessId, id);
        let gatewayRefundRef = null;
        if (ret.refundMethod === 'card' || ret.refundMethod === 'online') {
            const payment = await this.tenantPrisma.client.payment.findFirst({
                where: { orderId: ret.orderId, method: ret.refundMethod },
            });
            if (!payment?.providerRef) {
                throw new app_exception_1.AppException(returns_constants_1.RETURN_ERROR_CODES.PROVIDER_REF_MISSING, `The original ${ret.refundMethod} payment has no recorded gateway reference to refund against — checkout doesn't populate Payment.providerRef yet.`, common_1.HttpStatus.CONFLICT);
            }
            const result = await this.billing.refund(payment.providerRef, Number(ret.refundAmount));
            gatewayRefundRef = result.refundRef;
        }
        const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
            if (ret.restock) {
                for (const item of ret.items) {
                    const product = await tx.product.findUnique({
                        where: { id: item.productId },
                    });
                    if (product && product.kind === prisma_1.ProductKind.product) {
                        await tx.product.update({
                            where: { id: product.id },
                            data: { stockQty: { increment: item.qty } },
                        });
                        await tx.stockMovement.create({
                            data: {
                                businessId,
                                productId: product.id,
                                kind: prisma_1.StockMovementKind.return,
                                qty: item.qty,
                                unitCost: product.costPrice,
                            },
                        });
                    }
                }
            }
            if (ret.refundMethod === 'credit' ||
                ret.refundMethod === 'store_credit') {
                await tx.creditEntry.create({
                    data: {
                        businessId,
                        customerId: ret.customerId,
                        kind: 'payment',
                        amount: ret.refundAmount,
                        note: `Return ${ret.id}${ret.refundMethod === 'store_credit' ? ' — store credit' : ''}`,
                        orderId: ret.orderId,
                    },
                });
            }
            const row = await tx.return.update({
                where: { id: ret.id },
                data: { status: prisma_1.ReturnStatus.approved, approvedByUserId: actorUserId },
                include: { items: true },
            });
            await tx.auditLog.create({
                data: {
                    businessId,
                    actorUserId,
                    action: 'return.approve',
                    entity: 'Return',
                    entityId: ret.id,
                    after: {
                        ...row,
                        gatewayRefundRef,
                    },
                },
            });
            return row;
        });
        if (ret.refundMethod === 'cash') {
            await this.cashRegister.recordRefundMovement(businessId, Number(ret.refundAmount), `Return ${ret.id}`);
        }
        return updated;
    }
    async reject(businessId, id, reason) {
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        const ret = await this.findPending(businessId, id);
        return this.tenantPrisma.client.return.update({
            where: { id: ret.id },
            data: {
                status: prisma_1.ReturnStatus.rejected,
                approvedByUserId: actorUserId,
                reason: reason ? `${ret.reason}\n\nRejected: ${reason}` : ret.reason,
            },
        });
    }
    async findPending(businessId, id) {
        const ret = await this.tenantPrisma.client.return.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!ret || ret.businessId !== businessId) {
            throw new common_1.NotFoundException('Return not found');
        }
        if (ret.status !== prisma_1.ReturnStatus.pending) {
            throw new app_exception_1.AppException(returns_constants_1.RETURN_ERROR_CODES.NOT_PENDING, `Return is already "${ret.status}"`, common_1.HttpStatus.CONFLICT);
        }
        return ret;
    }
};
exports.ReturnsService = ReturnsService;
exports.ReturnsService = ReturnsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        cash_register_service_1.CashRegisterService,
        billing_service_1.BillingService])
], ReturnsService);
//# sourceMappingURL=returns.service.js.map