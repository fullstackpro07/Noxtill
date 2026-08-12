import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { BillingService } from '../billing/billing.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { RETURN_ERROR_CODES } from './returns.constants';
import {
  Prisma,
  ProductKind,
  ReturnStatus,
  StockMovementKind,
} from '../../generated/prisma';

/**
 * Returns & Refunds (UPD-BE-011). A return is raised (any role) then approved/rejected
 * (owner/manager only, enforced by @Roles at the controller). Approval is the one moment real
 * stock and money move — everything before that is just a proposal, and the refund amount is
 * always recomputed server-side from the order's own recorded item prices, never trusted from
 * the client.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly cashRegister: CashRegisterService,
    private readonly billing: BillingService,
  ) {}

  async create(businessId: string, dto: CreateReturnDto) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
        returns: {
          where: { status: { not: ReturnStatus.rejected } },
          include: { items: true },
        },
      },
    });
    if (!order || order.businessId !== businessId) {
      throw new NotFoundException('Order not found');
    }

    if (
      (dto.refundMethod === 'credit' || dto.refundMethod === 'store_credit') &&
      !order.customerId
    ) {
      throw new AppException(
        RETURN_ERROR_CODES.CUSTOMER_REQUIRED,
        'A credit/store-credit refund requires the order to have a customer',
        HttpStatus.BAD_REQUEST,
      );
    }

    const alreadyReturned = new Map<string, number>();
    for (const ret of order.returns) {
      for (const item of ret.items) {
        alreadyReturned.set(
          item.productId,
          (alreadyReturned.get(item.productId) ?? 0) + item.qty,
        );
      }
    }
    const orderItemByProduct = new Map(
      order.items
        .filter((i) => i.productId)
        .map((i) => [i.productId as string, i]),
    );

    let refundAmount = 0;
    const itemsData = dto.items.map((item) => {
      const orderItem = orderItemByProduct.get(item.productId);
      if (!orderItem) {
        throw new AppException(
          RETURN_ERROR_CODES.ITEM_NOT_IN_ORDER,
          `Product ${item.productId} was not part of order ${order.id}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const returnedSoFar = alreadyReturned.get(item.productId) ?? 0;
      if (returnedSoFar + item.qty > orderItem.qty) {
        throw new AppException(
          RETURN_ERROR_CODES.QTY_EXCEEDS_SOLD,
          `Cannot return ${item.qty} of "${orderItem.name}" — only ${orderItem.qty - returnedSoFar} left returnable`,
          HttpStatus.BAD_REQUEST,
        );
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

  async list(businessId: string, status?: ReturnStatus) {
    return this.tenantPrisma.client.return.findMany({
      where: { businessId, status },
      orderBy: { createdAt: 'desc' },
      include: { items: true, order: true, customer: true },
    });
  }

  async approve(businessId: string, id: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const ret = await this.findPending(businessId, id);

    // Card/online refunds hit a real external gateway — done BEFORE any DB write below, so a
    // failed gateway call (e.g. the disclosed Payment.providerRef gap) leaves this return
    // untouched (still pending, no stock/ledger change) rather than half-applied.
    let gatewayRefundRef: string | null = null;
    if (ret.refundMethod === 'card' || ret.refundMethod === 'online') {
      const payment = await this.tenantPrisma.client.payment.findFirst({
        where: { orderId: ret.orderId, method: ret.refundMethod },
      });
      if (!payment?.providerRef) {
        throw new AppException(
          RETURN_ERROR_CODES.PROVIDER_REF_MISSING,
          `The original ${ret.refundMethod} payment has no recorded gateway reference to refund against — checkout doesn't populate Payment.providerRef yet.`,
          HttpStatus.CONFLICT,
        );
      }
      const result = await this.billing.refund(
        payment.providerRef,
        Number(ret.refundAmount),
      );
      gatewayRefundRef = result.refundRef;
    }

    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      if (ret.restock) {
        for (const item of ret.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });
          if (product && product.kind === ProductKind.product) {
            await tx.product.update({
              where: { id: product.id },
              data: { stockQty: { increment: item.qty } },
            });
            await tx.stockMovement.create({
              data: {
                businessId,
                productId: product.id,
                kind: StockMovementKind.return,
                qty: item.qty,
                unitCost: product.costPrice,
              },
            });
          }
        }
      }

      if (
        ret.refundMethod === 'credit' ||
        ret.refundMethod === 'store_credit'
      ) {
        await tx.creditEntry.create({
          data: {
            businessId,
            customerId: ret.customerId!,
            kind: 'payment',
            amount: ret.refundAmount,
            note: `Return ${ret.id}${ret.refundMethod === 'store_credit' ? ' — store credit' : ''}`,
            orderId: ret.orderId,
          },
        });
      }

      const row = await tx.return.update({
        where: { id: ret.id },
        data: { status: ReturnStatus.approved, approvedByUserId: actorUserId },
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
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return row;
    });

    // Best-effort, outside the transaction — same convention as OrdersService.createSale's
    // post-commit cash-register hook: not every business runs a cash register at all.
    if (ret.refundMethod === 'cash') {
      await this.cashRegister.recordRefundMovement(
        businessId,
        Number(ret.refundAmount),
        `Return ${ret.id}`,
      );
    }

    return updated;
  }

  async reject(businessId: string, id: string, reason?: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const ret = await this.findPending(businessId, id);

    return this.tenantPrisma.client.return.update({
      where: { id: ret.id },
      data: {
        status: ReturnStatus.rejected,
        // No separate reviewer field exists — reused here to mean "who reviewed it", not just "who approved it".
        approvedByUserId: actorUserId,
        reason: reason ? `${ret.reason}\n\nRejected: ${reason}` : ret.reason,
      },
    });
  }

  private async findPending(businessId: string, id: string) {
    const ret = await this.tenantPrisma.client.return.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!ret || ret.businessId !== businessId) {
      throw new NotFoundException('Return not found');
    }
    if (ret.status !== ReturnStatus.pending) {
      throw new AppException(
        RETURN_ERROR_CODES.NOT_PENDING,
        `Return is already "${ret.status}"`,
        HttpStatus.CONFLICT,
      );
    }
    return ret;
  }
}
