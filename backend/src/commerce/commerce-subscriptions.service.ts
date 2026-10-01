import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommercePreorderCampaignStatus,
  CommercePreorderStatus,
  CommerceSubscriptionCycleStatus,
  CommerceSubscriptionInterval,
  CommerceSubscriptionPlanStatus,
  CommerceSubscriptionStatus,
  CommerceWorkOrderStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { OrdersService } from '../orders/orders.service';
import { COMMERCE_SUBSCRIPTION_ERROR_CODES as CODES } from './commerce.constants';
import type {
  CreateCommercePreorderCampaignDto,
  CreateCommerceSubscriptionPlanDto,
  ReserveCommercePreorderDto,
  SubscribeCommerceCustomerDto,
} from './dto/commerce-subscription.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Next renewal date. Month steps keep the day-of-month, clamped to the target month's last day. */
export function nextRenewalDate(
  from: Date,
  interval: CommerceSubscriptionInterval,
  count: number,
): Date {
  if (interval === CommerceSubscriptionInterval.week) {
    return new Date(from.getTime() + 7 * count * DAY_MS);
  }
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/** Monthly-equivalent value of one subscription, for the recurring-value estimate. */
export function monthlyValue(
  unitPrice: number,
  qty: number,
  interval: CommerceSubscriptionInterval,
  count: number,
): number {
  const perCycle = unitPrice * qty;
  return interval === CommerceSubscriptionInterval.week
    ? (perCycle * 52) / 12 / count
    : perCycle / count;
}

export type PromiseRisk =
  'released' | 'on_track' | 'supply_short' | 'past_promise';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Subscriptions & Pre-orders (Autonomous Commerce screen 14). Renewals and pre-order fulfilment
 * create canonical, unpaid Orders through OrdersService (stock is deducted there, as for any
 * order); nothing is charged here because no recurring-payment provider is connected. Pre-order
 * caps use a conditional update so they can't be oversold, and promise risk compares reserved
 * units with real stock plus Production work orders due before the promise date.
 */
@Injectable()
export class CommerceSubscriptionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly orders: OrdersService,
  ) {}

  private audit(
    businessId: string,
    entityType: string,
    entityId: string,
    action: string,
    actorUserId: string,
    extra: { reason?: string | null; before?: unknown; after?: unknown } = {},
  ) {
    return this.tenantPrisma.client.commerceSubscriptionAudit.create({
      data: {
        businessId,
        entityType,
        entityId,
        action,
        actorUserId,
        reason: extra.reason ?? null,
        before: (extra.before ?? undefined) as Prisma.InputJsonValue,
        after: (extra.after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  private async assertProduct(businessId: string, productId: string) {
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id: productId, businessId, active: true },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Product was not found or is inactive in Products.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async assertCustomer(businessId: string, customerId: string) {
    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true },
    });
    if (!customer) {
      throw new AppException(
        CODES.CUSTOMER_NOT_FOUND,
        'Customer was not found in Customers (CRM).',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ---- Plans & subscriptions -------------------------------------------------------------------

  async listPlans(businessId: string) {
    const plans =
      await this.tenantPrisma.client.commerceSubscriptionPlan.findMany({
        where: { businessId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sellingPrice: true,
              stockQty: true,
            },
          },
          _count: {
            select: {
              subscriptions: {
                where: { status: CommerceSubscriptionStatus.active },
              },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      });
    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      status: plan.status,
      qtyPerCycle: plan.qtyPerCycle,
      interval: plan.interval,
      intervalCount: plan.intervalCount,
      pricePerUnit:
        plan.pricePerUnit === null ? null : Number(plan.pricePerUnit),
      allowSkip: plan.allowSkip,
      product: {
        id: plan.product.id,
        name: plan.product.name,
        sellingPrice: Number(plan.product.sellingPrice),
        stockQty: plan.product.stockQty,
      },
      activeSubscriptions: plan._count.subscriptions,
    }));
  }

  async createPlan(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceSubscriptionPlanDto,
  ) {
    await this.assertProduct(businessId, dto.productId);
    try {
      const plan =
        await this.tenantPrisma.client.commerceSubscriptionPlan.create({
          data: {
            businessId,
            name: dto.name.trim(),
            productId: dto.productId,
            qtyPerCycle: dto.qtyPerCycle,
            interval: dto.interval,
            intervalCount: dto.intervalCount ?? 1,
            pricePerUnit: dto.pricePerUnit ?? null,
            allowSkip: dto.allowSkip ?? true,
          },
        });
      await this.audit(
        businessId,
        'plan',
        plan.id,
        'plan_created',
        actorUserId,
        { after: dto },
      );
      return plan;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NAME_TAKEN,
          'A plan with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async setPlanStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceSubscriptionPlanStatus,
  ) {
    const plan =
      await this.tenantPrisma.client.commerceSubscriptionPlan.findFirst({
        where: { id, businessId },
      });
    if (!plan) {
      throw new AppException(
        CODES.PLAN_NOT_FOUND,
        'Plan was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const updated =
      await this.tenantPrisma.client.commerceSubscriptionPlan.update({
        where: { id, businessId },
        data: { status },
      });
    await this.audit(businessId, 'plan', id, `plan_${status}`, actorUserId);
    return updated;
  }

  async subscribe(
    businessId: string,
    actorUserId: string,
    dto: SubscribeCommerceCustomerDto,
  ) {
    const plan =
      await this.tenantPrisma.client.commerceSubscriptionPlan.findFirst({
        where: { id: dto.planId, businessId },
      });
    if (!plan) {
      throw new AppException(
        CODES.PLAN_NOT_FOUND,
        'Plan was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (plan.status !== CommerceSubscriptionPlanStatus.active) {
      throw new AppException(
        CODES.INVALID_STATE,
        'This plan is archived and no longer accepts subscribers.',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertCustomer(businessId, dto.customerId);
    const subscription =
      await this.tenantPrisma.client.commerceSubscription.create({
        data: {
          businessId,
          planId: plan.id,
          customerId: dto.customerId,
          nextRenewalAt: new Date(dto.firstRenewalAt),
        },
      });
    await this.audit(
      businessId,
      'subscription',
      subscription.id,
      'subscribed',
      actorUserId,
      {
        after: {
          planId: plan.id,
          customerId: dto.customerId,
          firstRenewalAt: dto.firstRenewalAt,
        },
      },
    );
    return subscription;
  }

  private async findSubscription(businessId: string, id: string) {
    const subscription =
      await this.tenantPrisma.client.commerceSubscription.findFirst({
        where: { id, businessId },
        include: { plan: { include: { product: true } } },
      });
    if (!subscription) {
      throw new AppException(
        CODES.SUBSCRIPTION_NOT_FOUND,
        'Subscription was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return subscription;
  }

  async listSubscriptions(businessId: string) {
    const rows = await this.tenantPrisma.client.commerceSubscription.findMany({
      where: { businessId },
      include: {
        plan: {
          include: {
            product: { select: { id: true, name: true, sellingPrice: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        cycles: {
          orderBy: { dueAt: 'desc' },
          take: 3,
          include: {
            order: { select: { id: true, orderNo: true, status: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { nextRenewalAt: 'asc' }],
      take: 500,
    });
    const now = Date.now();
    return rows.map((row) => {
      const unitPrice =
        row.plan.pricePerUnit === null
          ? Number(row.plan.product.sellingPrice)
          : Number(row.plan.pricePerUnit);
      return {
        id: row.id,
        status: row.status,
        statusReason: row.statusReason,
        startedAt: row.startedAt,
        nextRenewalAt: row.nextRenewalAt,
        due:
          row.status === CommerceSubscriptionStatus.active &&
          row.nextRenewalAt.getTime() <= now,
        skipNextCycle: row.skipNextCycle,
        customer: row.customer,
        plan: {
          id: row.plan.id,
          name: row.plan.name,
          interval: row.plan.interval,
          intervalCount: row.plan.intervalCount,
          qtyPerCycle: row.plan.qtyPerCycle,
          allowSkip: row.plan.allowSkip,
          product: { id: row.plan.product.id, name: row.plan.product.name },
        },
        cycleValue: round2(unitPrice * row.plan.qtyPerCycle),
        recentCycles: row.cycles.map((cycle) => ({
          id: cycle.id,
          dueAt: cycle.dueAt,
          status: cycle.status,
          order: cycle.order,
        })),
      };
    });
  }

  /**
   * Processes one due renewal: claims the cycle (unique per due date, so a double click or a retry
   * can't create two orders), then either records a skip or creates a canonical unpaid order via
   * OrdersService, and advances the next renewal date.
   */
  async processRenewal(
    businessId: string,
    actorUserId: string,
    id: string,
    now = new Date(),
  ) {
    const subscription = await this.findSubscription(businessId, id);
    if (subscription.status !== CommerceSubscriptionStatus.active) {
      throw new AppException(
        CODES.INVALID_STATE,
        'Only active subscriptions renew.',
        HttpStatus.CONFLICT,
      );
    }
    if (subscription.nextRenewalAt.getTime() > now.getTime()) {
      throw new AppException(
        CODES.NOT_DUE,
        'This subscription is not due yet.',
        HttpStatus.CONFLICT,
      );
    }
    const dueAt = subscription.nextRenewalAt;
    let cycle: Prisma.CommerceSubscriptionCycleGetPayload<object>;
    try {
      cycle = await this.tenantPrisma.client.commerceSubscriptionCycle.create({
        data: {
          businessId,
          subscriptionId: id,
          dueAt,
          status: CommerceSubscriptionCycleStatus.processing,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.ALREADY_PROCESSED,
          'This renewal was already processed.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    const next = nextRenewalDate(
      dueAt,
      subscription.plan.interval,
      subscription.plan.intervalCount,
    );

    if (subscription.skipNextCycle) {
      await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.commerceSubscriptionCycle.update({
          where: { id: cycle.id, businessId },
          data: { status: CommerceSubscriptionCycleStatus.skipped },
        }),
        this.tenantPrisma.client.commerceSubscription.update({
          where: { id, businessId },
          data: { nextRenewalAt: next, skipNextCycle: false },
        }),
      ]);
      await this.audit(
        businessId,
        'subscription',
        id,
        'renewal_skipped',
        actorUserId,
        {
          after: { dueAt, nextRenewalAt: next },
        },
      );
      return {
        cycleId: cycle.id,
        status: CommerceSubscriptionCycleStatus.skipped,
        orderId: null,
        nextRenewalAt: next,
      };
    }

    let orderId: string;
    try {
      const order = await this.orders.createOrder(businessId, {
        orderType: 'online',
        customerId: subscription.customerId,
        items: [
          {
            productId: subscription.plan.productId,
            qty: subscription.plan.qtyPerCycle,
            ...(subscription.plan.pricePerUnit === null
              ? {}
              : { priceOverride: Number(subscription.plan.pricePerUnit) }),
          },
        ],
        paymentMethod: 'unpaid',
        notes: `Subscription renewal: ${subscription.plan.name} (due ${dueAt.toISOString().slice(0, 10)})`,
      });
      orderId = order.id;
    } catch (error) {
      // Release the claim so the renewal can be retried after the problem (e.g. stock) is fixed.
      await this.tenantPrisma.client.commerceSubscriptionCycle.delete({
        where: { id: cycle.id, businessId },
      });
      throw error;
    }
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.commerceSubscriptionCycle.update({
        where: { id: cycle.id, businessId },
        data: {
          status: CommerceSubscriptionCycleStatus.order_created,
          orderId,
        },
      }),
      this.tenantPrisma.client.commerceSubscription.update({
        where: { id, businessId },
        data: { nextRenewalAt: next },
      }),
    ]);
    await this.audit(
      businessId,
      'subscription',
      id,
      'renewal_order_created',
      actorUserId,
      {
        after: { dueAt, orderId, nextRenewalAt: next },
      },
    );
    return {
      cycleId: cycle.id,
      status: CommerceSubscriptionCycleStatus.order_created,
      orderId,
      nextRenewalAt: next,
    };
  }

  /** Processes every due renewal one by one; a failure on one doesn't stop the others. */
  async processDueRenewals(businessId: string, actorUserId: string) {
    const due = await this.tenantPrisma.client.commerceSubscription.findMany({
      where: {
        businessId,
        status: CommerceSubscriptionStatus.active,
        nextRenewalAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { nextRenewalAt: 'asc' },
      take: 200,
    });
    const results: Array<{
      subscriptionId: string;
      ok: boolean;
      status?: string;
      error?: string;
    }> = [];
    for (const row of due) {
      try {
        const result = await this.processRenewal(
          businessId,
          actorUserId,
          row.id,
        );
        results.push({
          subscriptionId: row.id,
          ok: true,
          status: result.status,
        });
      } catch (error) {
        results.push({
          subscriptionId: row.id,
          ok: false,
          error:
            error instanceof AppException
              ? ((error.getResponse() as { message?: string }).message ??
                'Failed')
              : 'Failed',
        });
      }
    }
    return {
      processed: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      results,
    };
  }

  async setSubscriptionStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceSubscriptionStatus,
    reason?: string,
  ) {
    const subscription = await this.findSubscription(businessId, id);
    if (subscription.status === CommerceSubscriptionStatus.cancelled) {
      throw new AppException(
        CODES.INVALID_STATE,
        'A cancelled subscription cannot change status.',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.tenantPrisma.client.commerceSubscription.update({
      where: { id, businessId },
      data: { status, statusReason: reason?.trim() || null },
    });
    await this.audit(
      businessId,
      'subscription',
      id,
      `subscription_${status}`,
      actorUserId,
      {
        reason: reason?.trim() || null,
        before: { status: subscription.status },
      },
    );
    return updated;
  }

  async toggleSkip(
    businessId: string,
    actorUserId: string,
    id: string,
    skip: boolean,
  ) {
    const subscription = await this.findSubscription(businessId, id);
    if (skip && !subscription.plan.allowSkip) {
      throw new AppException(
        CODES.INVALID_STATE,
        'This plan does not allow skipping a cycle.',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.tenantPrisma.client.commerceSubscription.update({
      where: { id, businessId },
      data: { skipNextCycle: skip },
    });
    await this.audit(
      businessId,
      'subscription',
      id,
      skip ? 'skip_next_set' : 'skip_next_cleared',
      actorUserId,
    );
    return updated;
  }

  // ---- Pre-orders ------------------------------------------------------------------------------

  async createCampaign(
    businessId: string,
    actorUserId: string,
    dto: CreateCommercePreorderCampaignDto,
  ) {
    await this.assertProduct(businessId, dto.productId);
    const campaign =
      await this.tenantPrisma.client.commercePreorderCampaign.create({
        data: {
          businessId,
          productId: dto.productId,
          name: dto.name.trim(),
          promisedDate: new Date(dto.promisedDate),
          maxUnits: dto.maxUnits ?? null,
          notes: dto.notes?.trim() || null,
        },
      });
    await this.audit(
      businessId,
      'campaign',
      campaign.id,
      'campaign_created',
      actorUserId,
      { after: dto },
    );
    return campaign;
  }

  private async findCampaign(businessId: string, id: string) {
    const campaign =
      await this.tenantPrisma.client.commercePreorderCampaign.findFirst({
        where: { id, businessId },
      });
    if (!campaign) {
      throw new AppException(
        CODES.CAMPAIGN_NOT_FOUND,
        'Pre-order campaign was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return campaign;
  }

  async listCampaigns(businessId: string, now = new Date()) {
    const campaigns =
      await this.tenantPrisma.client.commercePreorderCampaign.findMany({
        where: { businessId },
        include: {
          product: { select: { id: true, name: true, stockQty: true } },
          preorders: {
            include: {
              customer: { select: { id: true, name: true } },
              order: { select: { id: true, orderNo: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ status: 'asc' }, { promisedDate: 'asc' }],
      });
    // Planned production that would land before each promise date (Production & Assembly).
    const productIds = [
      ...new Set(campaigns.map((campaign) => campaign.productId)),
    ];
    const workOrders =
      await this.tenantPrisma.client.commerceWorkOrder.findMany({
        where: {
          businessId,
          productId: { in: productIds },
          status: {
            in: [
              CommerceWorkOrderStatus.planned,
              CommerceWorkOrderStatus.in_progress,
            ],
          },
        },
        select: {
          productId: true,
          qtyPlanned: true,
          dueDate: true,
          number: true,
        },
      });
    return campaigns.map((campaign) => {
      const reserved = campaign.preorders
        .filter((row) => row.status === CommercePreorderStatus.reserved)
        .reduce((sum, row) => sum + row.qty, 0);
      const incoming = workOrders.filter(
        (order) =>
          order.productId === campaign.productId &&
          order.dueDate !== null &&
          order.dueDate.getTime() <= campaign.promisedDate.getTime(),
      );
      const incomingUnits = incoming.reduce(
        (sum, order) => sum + order.qtyPlanned,
        0,
      );
      const risk: PromiseRisk =
        campaign.status === CommercePreorderCampaignStatus.released
          ? 'released'
          : now.getTime() > campaign.promisedDate.getTime()
            ? 'past_promise'
            : reserved > campaign.product.stockQty + incomingUnits
              ? 'supply_short'
              : 'on_track';
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        promisedDate: campaign.promisedDate,
        maxUnits: campaign.maxUnits,
        reservedUnits: campaign.reservedUnits,
        notes: campaign.notes,
        product: campaign.product,
        supply: {
          inStock: campaign.product.stockQty,
          incomingBeforePromise: incomingUnits,
          workOrders: incoming.map((order) => `WO-${order.number}`),
        },
        risk,
        preorders: campaign.preorders.map((row) => ({
          id: row.id,
          qty: row.qty,
          status: row.status,
          customer: row.customer,
          promisedDate: row.promisedDate,
          promiseChanged:
            row.promisedDate.getTime() !== campaign.promisedDate.getTime(),
          order: row.order,
        })),
      };
    });
  }

  /** Reserves units atomically: the conditional increment fails rather than exceed the cap. */
  async reserve(
    businessId: string,
    actorUserId: string,
    campaignId: string,
    dto: ReserveCommercePreorderDto,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.status !== CommercePreorderCampaignStatus.open) {
      throw new AppException(
        CODES.INVALID_STATE,
        'This pre-order campaign is not open.',
        HttpStatus.CONFLICT,
      );
    }
    await this.assertCustomer(businessId, dto.customerId);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const claimed = await tx.commercePreorderCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: CommercePreorderCampaignStatus.open,
          ...(campaign.maxUnits === null
            ? {}
            : { reservedUnits: { lte: campaign.maxUnits - dto.qty } }),
        },
        data: { reservedUnits: { increment: dto.qty } },
      });
      if (claimed.count !== 1) {
        throw new AppException(
          CODES.CAPACITY_EXCEEDED,
          'Not enough pre-order units left in this campaign.',
          HttpStatus.CONFLICT,
        );
      }
      const preorder = await tx.commercePreorder.create({
        data: {
          businessId,
          campaignId,
          customerId: dto.customerId,
          qty: dto.qty,
          promisedDate: campaign.promisedDate,
        },
      });
      await tx.commerceSubscriptionAudit.create({
        data: {
          businessId,
          entityType: 'preorder',
          entityId: preorder.id,
          action: 'preorder_reserved',
          actorUserId,
          after: {
            campaignId,
            customerId: dto.customerId,
            qty: dto.qty,
          } as Prisma.InputJsonValue,
        },
      });
      return preorder;
    });
  }

  async changePromiseDate(
    businessId: string,
    actorUserId: string,
    id: string,
    promisedDate: string,
    reason: string,
  ) {
    const campaign = await this.findCampaign(businessId, id);
    const updated =
      await this.tenantPrisma.client.commercePreorderCampaign.update({
        where: { id, businessId },
        data: { promisedDate: new Date(promisedDate) },
      });
    await this.audit(
      businessId,
      'campaign',
      id,
      'promise_date_changed',
      actorUserId,
      {
        reason: reason.trim(),
        before: { promisedDate: campaign.promisedDate },
        after: { promisedDate: updated.promisedDate },
      },
    );
    return updated;
  }

  async setCampaignStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommercePreorderCampaignStatus,
  ) {
    const campaign = await this.findCampaign(businessId, id);
    if (
      campaign.status === CommercePreorderCampaignStatus.released &&
      status !== CommercePreorderCampaignStatus.released
    ) {
      throw new AppException(
        CODES.INVALID_STATE,
        'A released campaign stays released.',
        HttpStatus.CONFLICT,
      );
    }
    const updated =
      await this.tenantPrisma.client.commercePreorderCampaign.update({
        where: { id, businessId },
        data: { status },
      });
    await this.audit(
      businessId,
      'campaign',
      id,
      `campaign_${status}`,
      actorUserId,
    );
    return updated;
  }

  /** Converts a reservation into a canonical unpaid order once the campaign is released. */
  async fulfillPreorder(
    businessId: string,
    actorUserId: string,
    preorderId: string,
  ) {
    const preorder = await this.tenantPrisma.client.commercePreorder.findFirst({
      where: { id: preorderId, businessId },
      include: { campaign: true },
    });
    if (!preorder) {
      throw new AppException(
        CODES.PREORDER_NOT_FOUND,
        'Pre-order was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (preorder.status !== CommercePreorderStatus.reserved) {
      throw new AppException(
        CODES.INVALID_STATE,
        'Only reserved pre-orders can be fulfilled.',
        HttpStatus.CONFLICT,
      );
    }
    if (preorder.campaign.status !== CommercePreorderCampaignStatus.released) {
      throw new AppException(
        CODES.INVALID_STATE,
        'Mark the campaign as released (stock arrived) before fulfilling.',
        HttpStatus.CONFLICT,
      );
    }
    // Claim first so two clicks can't create two orders.
    const claimed = await this.tenantPrisma.client.commercePreorder.updateMany({
      where: {
        id: preorderId,
        businessId,
        status: CommercePreorderStatus.reserved,
        orderId: null,
      },
      data: { status: CommercePreorderStatus.fulfilled },
    });
    if (claimed.count !== 1) {
      throw new AppException(
        CODES.ALREADY_PROCESSED,
        'This pre-order is already being fulfilled.',
        HttpStatus.CONFLICT,
      );
    }
    try {
      const order = await this.orders.createOrder(businessId, {
        orderType: 'online',
        customerId: preorder.customerId,
        items: [{ productId: preorder.campaign.productId, qty: preorder.qty }],
        paymentMethod: 'unpaid',
        notes: `Pre-order fulfilment: ${preorder.campaign.name}`,
      });
      await this.tenantPrisma.client.commercePreorder.update({
        where: { id: preorderId, businessId },
        data: { orderId: order.id },
      });
      await this.audit(
        businessId,
        'preorder',
        preorderId,
        'preorder_fulfilled',
        actorUserId,
        { after: { orderId: order.id } },
      );
      return { preorderId, orderId: order.id };
    } catch (error) {
      await this.tenantPrisma.client.commercePreorder.update({
        where: { id: preorderId, businessId },
        data: { status: CommercePreorderStatus.reserved },
      });
      throw error;
    }
  }

  async cancelPreorder(
    businessId: string,
    actorUserId: string,
    preorderId: string,
    reason: string,
  ) {
    const preorder = await this.tenantPrisma.client.commercePreorder.findFirst({
      where: { id: preorderId, businessId },
    });
    if (!preorder) {
      throw new AppException(
        CODES.PREORDER_NOT_FOUND,
        'Pre-order was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (preorder.status !== CommercePreorderStatus.reserved) {
      throw new AppException(
        CODES.INVALID_STATE,
        'Only reserved pre-orders can be cancelled here; use Orders → Returns for fulfilled ones.',
        HttpStatus.CONFLICT,
      );
    }
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.commercePreorder.update({
        where: { id: preorderId, businessId },
        data: { status: CommercePreorderStatus.cancelled },
      }),
      this.tenantPrisma.client.commercePreorderCampaign.update({
        where: { id: preorder.campaignId, businessId },
        data: { reservedUnits: { decrement: preorder.qty } },
      }),
    ]);
    await this.audit(
      businessId,
      'preorder',
      preorderId,
      'preorder_cancelled',
      actorUserId,
      { reason: reason.trim() },
    );
    return { cancelled: true };
  }

  async summary(businessId: string) {
    const [subscriptions, campaigns] = await Promise.all([
      this.tenantPrisma.client.commerceSubscription.findMany({
        where: {
          businessId,
          status: {
            in: [
              CommerceSubscriptionStatus.active,
              CommerceSubscriptionStatus.paused,
            ],
          },
        },
        include: {
          plan: { include: { product: { select: { sellingPrice: true } } } },
        },
      }),
      this.listCampaigns(businessId),
    ]);
    const now = Date.now();
    const active = subscriptions.filter(
      (row) => row.status === CommerceSubscriptionStatus.active,
    );
    const in30 = now + 30 * DAY_MS;
    return {
      activeSubscriptions: active.length,
      pausedSubscriptions: subscriptions.length - active.length,
      renewalsDue: active.filter((row) => row.nextRenewalAt.getTime() <= now)
        .length,
      upcomingUnits30d: active
        .filter(
          (row) => row.nextRenewalAt.getTime() <= in30 && !row.skipNextCycle,
        )
        .reduce((sum, row) => sum + row.plan.qtyPerCycle, 0),
      // Estimate: monthly-equivalent of each active subscription at today's plan/product price.
      recurringMonthlyValue: round2(
        active.reduce((sum, row) => {
          const unit =
            row.plan.pricePerUnit === null
              ? Number(row.plan.product.sellingPrice)
              : Number(row.plan.pricePerUnit);
          return (
            sum +
            monthlyValue(
              unit,
              row.plan.qtyPerCycle,
              row.plan.interval,
              row.plan.intervalCount,
            )
          );
        }, 0),
      ),
      openPreorderUnits: campaigns
        .filter(
          (campaign) =>
            campaign.status !== CommercePreorderCampaignStatus.released,
        )
        .reduce((sum, campaign) => sum + campaign.reservedUnits, 0),
      promisesAtRisk: campaigns.filter(
        (campaign) =>
          campaign.risk === 'supply_short' || campaign.risk === 'past_promise',
      ).length,
    };
  }
}
