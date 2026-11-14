import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID, CLS_KEY_ROLE, CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { resolvePolicies } from '../common/policies/policies.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { BillingService } from '../billing/billing.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { RETURN_ERROR_CODES } from './returns.constants';
import {
  CUSTOMER_RETURN_APPROVED_EVENT_JOB,
  SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE,
  FINANCE_RETURN_APPROVED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import {
  Prisma,
  ProductKind,
  ReturnStatus,
  Role,
  StockMovementKind,
} from '@prisma/client';

/**
 * Returns & Refunds (UPD-BE-011). A return is raised (any role) then approved/rejected
 * (owner/manager only, enforced by @Roles at the controller). Approval is the one moment real
 * stock and money move — everything before that is just a proposal, and the refund amount is
 * always recomputed server-side from the order's own recorded item prices, never trusted from
 * the client.
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly cashRegister: CashRegisterService,
    private readonly billing: BillingService,
    @Optional()
    @InjectQueue(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
    private readonly financeAgentEvents?: Queue,
    @Optional()
    @InjectQueue(SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE)
    private readonly customerAgentEvents?: Queue,
  ) {}

  async create(businessId: string, dto: CreateReturnDto) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
        payments: true,
        creditEntries: true,
        returns: {
          where: { status: { not: ReturnStatus.rejected } },
          include: { items: true },
        },
      },
    });
    if (!order || order.businessId !== businessId) {
      throw new NotFoundException('Order not found');
    }

    // Owner policy: refund the way the customer paid. An order with no recorded payment
    // (e.g. still unpaid) has no "original method" to hold the refund to.
    if ((await this.policies(businessId)).bool('returns.refundToOriginalMethod')) {
      const original = new Set<string>(order.payments.map((p) => p.method));
      if (order.creditEntries.some((e) => e.kind === 'credit')) original.add('credit');
      if (original.size > 0 && !original.has(dto.refundMethod)) {
        throw new AppException(
          RETURN_ERROR_CODES.METHOD_NOT_ORIGINAL,
          `This order was paid by ${[...original].join(' / ')}; refunds must go back the same way`,
          HttpStatus.BAD_REQUEST,
        );
      }
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

    // Owner policy: a refund above the limit is the owner's call, whoever holds returns.approve.
    const refundLimit = (await this.policies(businessId)).num('returns.refundLimit');
    if (
      refundLimit !== null &&
      Number(ret.refundAmount) > refundLimit &&
      this.cls.get<Role | undefined>(CLS_KEY_ROLE) !== Role.owner
    ) {
      throw new AppException(
        RETURN_ERROR_CODES.ABOVE_REFUND_LIMIT,
        `Refunds above ${refundLimit.toFixed(2)} need the owner's approval (this one is ${Number(ret.refundAmount).toFixed(2)})`,
        HttpStatus.FORBIDDEN,
      );
    }

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

    // This is a read-only follow-up to the canonical approval. The worker uses the approved
    // Return row and never claims that approval alone proves settlement or cash payout.
    await this.queueApprovedReturnFinanceReview(updated);
    await this.queueApprovedReturnCustomerReview(updated);

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

  private async queueApprovedReturnFinanceReview(returned: {
    id: string;
    businessId: string;
    updatedAt: Date;
  }): Promise<void> {
    if (!this.financeAgentEvents) return;
    try {
      const business = await this.tenantPrisma.client.business.findUnique({
        where: { id: returned.businessId },
        select: { id: true, policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.financeEnabled') ||
        !policies.bool('agents.financeApprovedReturnEventReviewEnabled')
      ) {
        return;
      }
      await this.financeAgentEvents.add(
        FINANCE_RETURN_APPROVED_EVENT_JOB,
        {
          businessId: returned.businessId,
          returnId: returned.id,
          approvedAt: returned.updatedAt.toISOString(),
        },
        {
          jobId: `finance-return-approved-${returned.businessId}-${returned.id}-${returned.updatedAt.getTime()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // Queue failure must never roll back a completed return/refund approval.
      this.logger.warn(
        `Could not queue Finance review for approved return ${returned.id}: ${(error as Error).message}`,
      );
    }
  }

  private async queueApprovedReturnCustomerReview(returned: {
    id: string;
    businessId: string;
    updatedAt: Date;
  }): Promise<void> {
    if (!this.customerAgentEvents) return;
    try {
      const business = await this.tenantPrisma.client.business.findUnique({
        where: { id: returned.businessId },
        select: { id: true, policies: true },
      });
      if (
        !business ||
        !resolvePolicies(business).bool(
          'agents.customerReturnApprovedEventReviewEnabled',
        )
      ) {
        return;
      }
      await this.customerAgentEvents.add(
        CUSTOMER_RETURN_APPROVED_EVENT_JOB,
        {
          businessId: returned.businessId,
          returnId: returned.id,
          approvedAt: returned.updatedAt.toISOString(),
        },
        {
          jobId: `customer-return-approved-${returned.businessId}-${returned.id}-${returned.updatedAt.getTime()}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Could not queue Customer review for approved return ${returned.id}: ${(error as Error).message}`,
      );
    }
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

  private async policies(businessId: string) {
    const activeId = this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    return resolvePolicies(
      await this.tenantPrisma.client.business.findUnique({ where: { id: activeId }, select: { policies: true } }),
    );
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
