import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { CouponsService } from '../marketing/coupons.service';
import { VouchersService } from '../marketing/vouchers.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { generateReviewToken } from '../reviews/review-token.util';
import { CreateSaleDto } from './dto/create-sale.dto';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import {
  ORDER_ERROR_CODES,
  ORDER_STATUS_TRANSITIONS,
} from './orders.constants';
import { computeOrderTotals, resolveTaxRatePercent } from './order-totals.util';
import { OrderStatus, Prisma, ProductKind } from '@prisma/client';
import { withDeadlockRetry } from '../common/utils/prisma-transaction-retry.util';

/**
 * Narrow shape of the transaction client actually used by `resolveCustomerId` — the tenant-scoped
 * extended client's real `$transaction` callback type doesn't structurally match the plain
 * `Prisma.TransactionClient`, so this mirrors the same hand-written-subset-interface pattern
 * already used by `ReferralsService.issueRewardIfEligible`'s `TxClient`.
 */
interface CustomerUpsertTxClient {
  customer: {
    upsert(args: {
      where: { businessId_phone: { businessId: string; phone: string } };
      create: { businessId: string; phone: string; name: string };
      update: Record<string, never>;
    }): Promise<{ id: string }>;
  };
}

/**
 * Products/Orders/POS module (BE-M2). `createSale` is THE atomic transaction
 * (spec §4.3): order + item snapshots (cogs/profit) + stock movements +
 * customer upsert/stats + payment OR credit entry + audit, all-or-nothing.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly sendGate: SendGateService,
    private readonly reviewRequests: ReviewRequestsService,
    private readonly referrals: ReferralsService,
    private readonly coupons: CouponsService,
    private readonly vouchers: VouchersService,
    private readonly loyalty: LoyaltyService,
    private readonly activity: ActivityService,
    private readonly cashRegister: CashRegisterService,
  ) {}

  /** Shared by createSale and createDraft — a draft's cart may also name a customer by phone. */
  private async resolveCustomerId(
    tx: CustomerUpsertTxClient,
    businessId: string,
    dto: { customerId?: string; customerPhone?: string; customerName?: string },
  ): Promise<string | undefined> {
    if (dto.customerId) return dto.customerId;
    if (!dto.customerPhone) return undefined;
    const customer = await tx.customer.upsert({
      where: { businessId_phone: { businessId, phone: dto.customerPhone } },
      create: {
        businessId,
        phone: dto.customerPhone,
        name: dto.customerName ?? dto.customerPhone,
      },
      update: {},
    });
    return customer.id;
  }

  async createSale(businessId: string, dto: CreateSaleDto) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);

    const { order, reviewToken, reviewCustomerId } = await withDeadlockRetry(
      () =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const business = await tx.business.findUniqueOrThrow({
            where: { id: businessId },
          });

          const customerId = await this.resolveCustomerId(tx, businessId, dto);

          if (dto.payment.method === 'credit' && !customerId) {
            throw new AppException(
              ORDER_ERROR_CODES.CREDIT_REQUIRES_CUSTOMER,
              'Credit sales require a customer',
              HttpStatus.BAD_REQUEST,
            );
          }

          const productIds = [...new Set(dto.items.map((i) => i.productId))];
          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
          });
          const productMap = new Map(products.map((p) => [p.id, p]));
          const taxRules = await tx.taxRule.findMany({ where: { businessId } });

          const itemsData = dto.items.map((item) => {
            const product = productMap.get(item.productId);
            if (!product) {
              throw new AppException(
                ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
                `Product ${item.productId} not found`,
                HttpStatus.BAD_REQUEST,
              );
            }
            if (
              product.kind === ProductKind.product &&
              product.stockQty < item.qty
            ) {
              throw new AppException(
                ORDER_ERROR_CODES.INSUFFICIENT_STOCK,
                `Insufficient stock for "${product.name}" (have ${product.stockQty}, need ${item.qty})`,
                HttpStatus.BAD_REQUEST,
              );
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
              taxRatePercent: resolveTaxRatePercent(
                taxRules.map((r) => ({ ...r, rate: Number(r.rate) })),
                product.category,
                Number(business.taxRate),
              ),
            };
          });

          // Coupons (UPD-BE-029): validated/applied against the real pre-discount subtotal, before
          // computeOrderTotals, so the discount it produces feeds into tax/total math like any
          // other discount. Never trusts a client-supplied discount amount.
          const rawSubtotal = itemsData.reduce(
            (sum, item) => sum + item.price * item.qty,
            0,
          );

          let couponId: string | undefined;
          let couponDiscountAmount = 0;
          if (dto.couponCode) {
            const couponResult = await this.coupons.validateAndApply(
              businessId,
              dto.couponCode,
              rawSubtotal,
              customerId,
              tx,
            );
            couponId = couponResult.couponId;
            couponDiscountAmount = couponResult.discountAmount;
          }

          const discount = Math.min(
            rawSubtotal,
            (dto.discount ?? 0) + couponDiscountAmount,
          );
          const { subtotal, tax, total, cogs } = computeOrderTotals(
            itemsData,
            discount,
            Number(business.taxRate),
          );

          // Vouchers (UPD-BE-030): a payment method, not a discount — offsets the amount collected
          // via payment/creditEntry below, never `total` itself.
          let voucherId: string | undefined;
          let voucherAmountApplied = 0;
          if (dto.voucherCode) {
            const voucherResult = await this.vouchers.validateAndApply(
              businessId,
              dto.voucherCode,
              dto.voucherAmount ?? total,
              total,
              tx,
            );
            voucherId = voucherResult.voucherId;
            voucherAmountApplied = voucherResult.amountApplied;
          }

          const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
          // MySQL migration: MAX()+arithmetic over an Int column comes back as a JS `bigint`
          // (mysql2/Prisma type it BIGINT), not `number` — Prisma's `Int` column write rejects a bigint.
          const orderNo = Number(orderNoRaw);

          const order = await tx.order.create({
            data: {
              businessId,
              orderNo,
              customerId,
              orderType: dto.orderType ?? 'counter',
              tableNo: dto.tableNo,
              staffUserId: dto.staffUserId,
              status: OrderStatus.completed,
              subtotal,
              tax,
              discount,
              total,
              cogs,
              couponId,
              couponDiscountAmount: couponId ? couponDiscountAmount : undefined,
              voucherId,
              voucherAmountApplied: voucherId
                ? voucherAmountApplied
                : undefined,
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
            if (item.kind === ProductKind.product) {
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

          // A voucher offsets what's actually owed (like partial cash tendered) — the credit/payment
          // record reflects the remaining balance, not the order's full total.
          const amountDue =
            Math.round((total - voucherAmountApplied) * 100) / 100;

          if (dto.payment.method === 'credit') {
            await tx.creditEntry.create({
              data: {
                businessId,
                customerId: customerId!,
                kind: 'credit',
                amount: amountDue,
                note: dto.payment.note ?? 'Sale on credit',
                orderId: order.id,
              },
            });
          } else {
            await tx.payment.create({
              data: {
                orderId: order.id,
                method: dto.payment.method,
                amount: dto.payment.amount ?? amountDue,
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
            await this.referrals.issueRewardIfEligible(
              businessId,
              customerId,
              tx,
            );
            await this.loyalty.issueStampIfEligible(
              businessId,
              customerId,
              order.id,
              tx,
            );
          }

          await tx.auditLog.create({
            data: {
              businessId,
              actorUserId,
              action: 'sale.create',
              entity: 'Order',
              entityId: order.id,
              after: order as unknown as Prisma.InputJsonValue,
            },
          });

          let reviewToken: string | undefined;
          if (customerId) {
            reviewToken = generateReviewToken();
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

          const orderWithRelations = await tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: {
              items: true,
              payments: true,
              creditEntries: true,
              customer: true,
            },
          });

          return {
            order: orderWithRelations,
            reviewToken,
            reviewCustomerId: customerId,
          };
        }),
    );

    // Recorded before the queue-scheduling call below: activity recording is fast and fail-fast
    // by design (activity.record() never throws or hangs), and must not be gated behind
    // scheduleSend()'s queue add, which — unlike activity's own Redis usage — retries
    // indefinitely by BullMQ's own design and can block this request far longer.
    await this.activity.record(businessId, {
      type: 'sale',
      description: `Sale #${order.orderNo} — ${Number(order.total)}`,
      amount: Number(order.total),
      entityType: 'Order',
      entityId: order.id,
      actorUserId,
    });

    // Cash Register (UPD-BE-006): best-effort — silently a no-op if no shift is currently open,
    // since not every business uses the cash register at all.
    if (dto.payment.method === 'cash') {
      await this.cashRegister.recordSaleMovement(
        businessId,
        Number(order.total),
        order.id,
      );
    }

    // Outside the DB transaction: scheduling a send is queue work, not a DB write.
    // Best-effort — a failure here shouldn't roll back an already-completed sale.
    if (reviewToken && reviewCustomerId) {
      await this.reviewRequests.scheduleSend(
        businessId,
        reviewCustomerId,
        reviewToken,
      );
    }

    return order;
  }

  /**
   * Draft Orders (UPD-BE-009). Unlike `createSale`, a draft is a real `Order`/`OrderItem` row
   * pair with status `draft` — but stops there: no stock decrement, no payment/credit entry, no
   * customer stats bump, no audit log, no review request. Those all happen exactly once, at
   * `convertDraft`, by handing off to the real `createSale`.
   */
  async createDraft(businessId: string, dto: HoldSaleDto) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      const customerId = await this.resolveCustomerId(tx, businessId, dto);

      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));
      const taxRules = await tx.taxRule.findMany({ where: { businessId } });

      const itemsData = dto.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new AppException(
            ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
            `Product ${item.productId} not found`,
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          productId: product.id,
          name: product.name,
          price: item.priceOverride ?? Number(product.sellingPrice),
          cost: Number(product.costPrice),
          qty: item.qty,
          taxRatePercent: resolveTaxRatePercent(
            taxRules.map((r) => ({ ...r, rate: Number(r.rate) })),
            product.category,
            Number(business.taxRate),
          ),
        };
      });

      const discount = dto.discount ?? 0;
      const { subtotal, tax, total, cogs } = computeOrderTotals(
        itemsData,
        discount,
        Number(business.taxRate),
      );

      const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
      // MySQL migration: MAX()+arithmetic over an Int column comes back as a JS `bigint`
      // (mysql2/Prisma type it BIGINT), not `number` — Prisma's `Int` column write rejects a bigint.
      const orderNo = Number(orderNoRaw);

      const order = await tx.order.create({
        data: {
          businessId,
          orderNo,
          customerId,
          orderType: dto.orderType ?? 'counter',
          tableNo: dto.tableNo,
          staffUserId: dto.staffUserId,
          status: OrderStatus.draft,
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

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, customer: true },
      });
    });
  }

  async convertDraft(businessId: string, id: string, dto: ResumeHeldSaleDto) {
    const draft = await this.tenantPrisma.client.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (
      !draft ||
      draft.businessId !== businessId ||
      draft.status !== OrderStatus.draft
    ) {
      throw new NotFoundException('Draft order not found');
    }

    const saleDto: CreateSaleDto = {
      orderType: draft.orderType as CreateSaleDto['orderType'],
      tableNo: draft.tableNo ?? undefined,
      customerId: draft.customerId ?? undefined,
      staffUserId: draft.staffUserId ?? undefined,
      // Locks in the price the customer saw on the draft rather than re-pricing at convert time.
      // `productId` is always set here — createDraft() never stores an item without one.
      items: draft.items.map((item) => {
        if (!item.productId) {
          throw new AppException(
            ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
            `Draft order item ${item.id} has no product reference`,
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          productId: item.productId,
          qty: item.qty,
          priceOverride: Number(item.price),
        };
      }),
      discount: Number(draft.discount),
      payment: dto.payment,
    };

    const order = await this.createSale(businessId, saleDto);
    // Only removed after the real sale genuinely succeeds — see HeldSalesService.resume().
    await this.tenantPrisma.client.orderItem.deleteMany({
      where: { orderId: draft.id },
    });
    await this.tenantPrisma.client.order.delete({ where: { id: draft.id } });
    return order;
  }

  async updateStatus(
    businessId: string,
    orderId: string,
    nextStatus: OrderStatus,
  ) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(nextStatus)) {
      throw new AppException(
        ORDER_ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Cannot move an order from "${order.status}" to "${nextStatus}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.tenantPrisma.client.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
      include: {
        items: true,
        payments: true,
        creditEntries: true,
        customer: true,
      },
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

  /**
   * Split Bill (UPD-BE-010) — a pure preview, matching the spec's own framing as a "popup"
   * calculation. Never mutates the order or creates sub-orders; the remainder from rounding
   * (e.g. 10.01 / 3) is added to the first share so shares always sum exactly to the total.
   */
  async splitBill(id: string, parts: number) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const total = Number(order.total);
    const perShare = Math.floor((total / parts) * 100) / 100;
    const shares = Array<number>(parts).fill(perShare);
    shares[0] = Math.round((total - perShare * (parts - 1)) * 100) / 100;

    return { orderId: order.id, total, parts, shares };
  }

  async findOne(id: string) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        creditEntries: true,
        customer: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  findAll(status?: OrderStatus) {
    return this.tenantPrisma.client.order.findMany({
      where: { status, isQuotation: false },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        payments: true,
        creditEntries: true,
        customer: true,
      },
    });
  }
}
