import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceFulfillmentMappingRole,
  CommerceFulfillmentNodeStatus,
  CommerceFulfillmentNodeType,
  CommerceRoutingDecisionStatus,
  CommerceRoutingMode,
  OrderStatus,
  OrderType,
  Prisma,
  ProductKind,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMERCE_ROUTING_ERROR_CODES as CODES,
  COMMERCE_ROUTING_POLICY_VERSION,
} from './commerce.constants';

/** Orders that ship to a customer; counter, dine-in and takeaway are fulfilled on the spot. */
const ROUTABLE_ORDER_TYPES: OrderType[] = [
  OrderType.online,
  OrderType.delivery,
];
/** Still open for fulfilment. */
const ROUTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.in_progress,
];

export type StockCheck =
  'available' | 'insufficient' | 'not_in_branch' | 'not_tracked';
export type MarketCheck =
  'served' | 'not_served' | 'not_configured' | 'unknown';

export interface RoutableLine {
  orderItemId: string;
  productId: string;
  name: string;
  sku: string | null;
  qty: number;
}

export interface ContextNode {
  id: string;
  name: string;
  type: CommerceFulfillmentNodeType;
  branchBusinessId: string | null;
  serviceMarkets: string[];
  processingDays: number | null;
  costPerOrder: number | null;
}

export interface RoutingContext {
  nodes: ContextNode[];
  /** productId -> nodeId -> role */
  mappings: Map<string, Map<string, CommerceFulfillmentMappingRole>>;
  /** branchBusinessId -> sku -> stockQty */
  branchStock: Map<string, Map<string, number>>;
}

export interface LineCheck {
  orderItemId: string;
  role: CommerceFulfillmentMappingRole | null;
  stock: StockCheck;
  eligible: boolean;
  reasons: string[];
}

export interface NodeEvaluation {
  nodeId: string;
  name: string;
  type: CommerceFulfillmentNodeType;
  market: MarketCheck;
  processingDays: number | null;
  costPerOrder: number | null;
  lines: LineCheck[];
  /** Can fulfil every routable line on its own. */
  eligibleForAll: boolean;
}

export interface RoutingEvaluation {
  policyVersion: string;
  destinationCountry: string | null;
  lines: RoutableLine[];
  nodes: NodeEvaluation[];
  recommendation: {
    mode: CommerceRoutingMode;
    allocations: Array<{ orderItemId: string; nodeId: string }>;
    why: string[];
  } | null;
  unroutableLineIds: string[];
}

function markets(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function nullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** Ranking key for one node on one line: primary > backup, verified stock > untracked. */
function lineRank(check: LineCheck): number {
  return (
    (check.role === CommerceFulfillmentMappingRole.primary ? 2 : 0) +
    (check.stock === 'available' ? 1 : 0)
  );
}

function compareNodes(a: NodeEvaluation, b: NodeEvaluation): number {
  const score = (node: NodeEvaluation) =>
    node.lines.reduce((sum, line) => sum + lineRank(line), 0);
  return (
    score(b) - score(a) ||
    Number(b.market === 'served') - Number(a.market === 'served') ||
    nullsLast(a.processingDays, b.processingDays) ||
    nullsLast(a.costPerOrder, b.costPerOrder) ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Fulfillment Router (Autonomous Commerce screen 8). Evaluates the configured Fulfillment Network
 * for each open shipping order and records an operator-approved route. Deterministic: the same
 * data and policy version always produce the same ranking, and every decision stores the full
 * evidence. Never marks orders fulfilled, never reserves stock, never auto-routes.
 */
@Injectable()
export class CommerceFulfillmentRouterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    /** Raw client for reading branch stock across the business group (as RollupService does). */
    private readonly prisma: PrismaService,
  ) {}

  private routableLines(
    items: Array<{
      id: string;
      name: string;
      qty: number;
      productId: string | null;
      product: { kind: ProductKind; sku: string | null } | null;
    }>,
  ): RoutableLine[] {
    return items.flatMap((item) =>
      item.productId && item.product?.kind === ProductKind.product
        ? [
            {
              orderItemId: item.id,
              productId: item.productId,
              name: item.name,
              sku: item.product.sku,
              qty: item.qty,
            },
          ]
        : [],
    );
  }

  private async loadContext(
    businessId: string,
    productIds: string[],
  ): Promise<RoutingContext> {
    const [nodes, mappingRows] = await Promise.all([
      this.tenantPrisma.client.commerceFulfillmentNode.findMany({
        where: { businessId, status: CommerceFulfillmentNodeStatus.active },
        orderBy: { name: 'asc' },
      }),
      productIds.length
        ? this.tenantPrisma.client.commerceFulfillmentMapping.findMany({
            where: { businessId, productId: { in: productIds } },
            select: { productId: true, nodeId: true, role: true },
          })
        : Promise.resolve([]),
    ]);
    const mappings = new Map<
      string,
      Map<string, CommerceFulfillmentMappingRole>
    >();
    for (const row of mappingRows) {
      const byNode =
        mappings.get(row.productId) ??
        new Map<string, CommerceFulfillmentMappingRole>();
      byNode.set(row.nodeId, row.role);
      mappings.set(row.productId, byNode);
    }
    const skus = productIds.length
      ? (
          await this.tenantPrisma.client.product.findMany({
            where: { businessId, id: { in: productIds } },
            select: { sku: true },
          })
        ).flatMap((row) => (row.sku?.trim() ? [row.sku.trim()] : []))
      : [];
    const branchStock = new Map<string, Map<string, number>>();
    const branchIds = [
      ...new Set(
        nodes.flatMap((node) =>
          node.type === CommerceFulfillmentNodeType.own_location &&
          node.branchBusinessId
            ? [node.branchBusinessId]
            : [],
        ),
      ),
    ];
    if (branchIds.length && skus.length) {
      // Branches don't share product identity, so stock is matched by SKU per branch.
      const rows = await this.prisma.product.findMany({
        where: { businessId: { in: branchIds }, sku: { in: skus } },
        select: { businessId: true, sku: true, stockQty: true },
      });
      for (const row of rows) {
        if (!row.sku) continue;
        const bySku =
          branchStock.get(row.businessId) ?? new Map<string, number>();
        bySku.set(row.sku, (bySku.get(row.sku) ?? 0) + row.stockQty);
        branchStock.set(row.businessId, bySku);
      }
    }
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        branchBusinessId: node.branchBusinessId,
        serviceMarkets: markets(node.serviceMarkets),
        processingDays: node.processingDays,
        costPerOrder:
          node.costPerOrder === null ? null : Number(node.costPerOrder),
      })),
      mappings,
      branchStock,
    };
  }

  private evaluate(
    lines: RoutableLine[],
    context: RoutingContext,
    destinationCountry: string | null,
  ): RoutingEvaluation {
    const nodes: NodeEvaluation[] = context.nodes.map((node) => {
      const market: MarketCheck = !destinationCountry
        ? 'unknown'
        : node.serviceMarkets.length === 0
          ? 'not_configured'
          : node.serviceMarkets.includes(destinationCountry)
            ? 'served'
            : 'not_served';
      const lineChecks = lines.map((line): LineCheck => {
        const role = context.mappings.get(line.productId)?.get(node.id) ?? null;
        let stock: StockCheck = 'not_tracked';
        if (
          node.type === CommerceFulfillmentNodeType.own_location &&
          node.branchBusinessId
        ) {
          const available = line.sku
            ? context.branchStock
                .get(node.branchBusinessId)
                ?.get(line.sku.trim())
            : undefined;
          stock =
            available === undefined
              ? 'not_in_branch'
              : available >= line.qty
                ? 'available'
                : 'insufficient';
        }
        const reasons: string[] = [];
        if (!role) reasons.push('Product is not mapped to this node');
        if (stock === 'insufficient')
          reasons.push(
            `Branch stock is below the ordered quantity (${line.qty})`,
          );
        if (stock === 'not_in_branch')
          reasons.push('This branch has no product with the same SKU');
        if (market === 'not_served')
          reasons.push(`Node does not serve ${destinationCountry}`);
        return {
          orderItemId: line.orderItemId,
          role,
          stock,
          eligible: reasons.length === 0,
          reasons,
        };
      });
      return {
        nodeId: node.id,
        name: node.name,
        type: node.type,
        market,
        processingDays: node.processingDays,
        costPerOrder: node.costPerOrder,
        lines: lineChecks,
        eligibleForAll:
          lines.length > 0 && lineChecks.every((check) => check.eligible),
      };
    });

    const single = nodes
      .filter((node) => node.eligibleForAll)
      .sort(compareNodes);
    let recommendation: RoutingEvaluation['recommendation'] = null;
    const unroutableLineIds: string[] = [];
    if (single.length) {
      const best = single[0];
      recommendation = {
        mode: CommerceRoutingMode.single,
        allocations: lines.map((line) => ({
          orderItemId: line.orderItemId,
          nodeId: best.nodeId,
        })),
        why: [
          `${best.name} can fulfil every line on its own`,
          ...(single.length > 1
            ? [
                `Ranked first of ${single.length} eligible nodes by primary mapping, verified stock, market, processing time, then cost`,
              ]
            : []),
        ],
      };
    } else if (lines.length) {
      const allocations: Array<{ orderItemId: string; nodeId: string }> = [];
      for (const line of lines) {
        const options = nodes
          .map((node) => ({
            node,
            check: node.lines.find(
              (check) => check.orderItemId === line.orderItemId,
            )!,
          }))
          .filter(({ check }) => check.eligible)
          .sort(
            (a, b) =>
              lineRank(b.check) - lineRank(a.check) ||
              compareNodes(a.node, b.node),
          );
        if (options.length) {
          allocations.push({
            orderItemId: line.orderItemId,
            nodeId: options[0].node.nodeId,
          });
        } else {
          unroutableLineIds.push(line.orderItemId);
        }
      }
      if (!unroutableLineIds.length) {
        recommendation = {
          mode: CommerceRoutingMode.split,
          allocations,
          why: [
            'No single node can fulfil every line, so each line goes to its best eligible node',
          ],
        };
      }
    }
    return {
      policyVersion: COMMERCE_ROUTING_POLICY_VERSION,
      destinationCountry,
      lines,
      nodes,
      recommendation,
      unroutableLineIds,
    };
  }

  private orderInclude() {
    return {
      customer: { select: { id: true, name: true } },
      delivery: { select: { addressLine: true, status: true } },
      items: {
        select: {
          id: true,
          name: true,
          qty: true,
          productId: true,
          product: { select: { kind: true, sku: true } },
        },
      },
      routingDecisions: {
        where: { status: CommerceRoutingDecisionStatus.active },
        include: {
          allocations: {
            select: {
              orderItemId: true,
              qty: true,
              node: { select: { id: true, name: true } },
            },
          },
        },
        take: 1,
      },
    } satisfies Prisma.OrderInclude;
  }

  /** Open shipping orders with physical lines, their current route and a live recommendation. */
  async queue(businessId: string) {
    const orders = await this.tenantPrisma.client.order.findMany({
      where: {
        businessId,
        isQuotation: false,
        orderType: { in: ROUTABLE_ORDER_TYPES },
        status: { in: ROUTABLE_STATUSES },
        items: { some: { product: { kind: ProductKind.product } } },
      },
      include: this.orderInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const allLines = orders.map((order) => this.routableLines(order.items));
    const context = await this.loadContext(businessId, [
      ...new Set(allLines.flat().map((line) => line.productId)),
    ]);
    return orders.map((order, index) => {
      const active = order.routingDecisions[0] ?? null;
      const evaluation = active
        ? null
        : this.evaluate(allLines[index], context, null);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        orderType: order.orderType,
        status: order.status,
        externalProvider: order.externalProvider,
        customer: order.customer,
        deliveryAddress: order.delivery?.addressLine ?? null,
        createdAt: order.createdAt,
        lines: allLines[index],
        route: active
          ? {
              decisionId: active.id,
              mode: active.mode,
              destinationCountry: active.destinationCountry,
              overrodeRecommendation: active.overrodeRecommendation,
              decidedAt: active.createdAt,
              allocations: active.allocations,
            }
          : null,
        // Without a destination the market check is "unknown"; the operator adds it on review.
        recommendation: evaluation?.recommendation ?? null,
        unroutable: evaluation ? evaluation.recommendation === null : false,
      };
    });
  }

  private async loadRoutableOrder(businessId: string, orderId: string) {
    const order = await this.tenantPrisma.client.order.findFirst({
      where: { id: orderId, businessId },
      include: this.orderInclude(),
    });
    if (!order) {
      throw new AppException(
        CODES.ORDER_NOT_FOUND,
        'Order was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const lines = this.routableLines(order.items);
    if (
      order.isQuotation ||
      !ROUTABLE_ORDER_TYPES.includes(order.orderType) ||
      !ROUTABLE_STATUSES.includes(order.status) ||
      lines.length === 0
    ) {
      throw new AppException(
        CODES.ORDER_NOT_ROUTABLE,
        'Only open online or delivery orders with physical catalog products can be routed.',
        HttpStatus.CONFLICT,
      );
    }
    return { order, lines };
  }

  /** Full candidate evaluation for one order, for the review drawer. */
  async candidates(
    businessId: string,
    orderId: string,
    destinationCountry?: string,
  ) {
    const { order, lines } = await this.loadRoutableOrder(businessId, orderId);
    const context = await this.loadContext(
      businessId,
      lines.map((line) => line.productId),
    );
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      ...this.evaluate(
        lines,
        context,
        destinationCountry ? destinationCountry.toUpperCase() : null,
      ),
    };
  }

  /**
   * Records an operator-approved route. The evaluation is recomputed server-side; every
   * allocation must be an eligible node for its line, and choosing anything other than the
   * recommendation requires a reason. Supersedes the order's previous active route.
   */
  async assign(
    businessId: string,
    actorUserId: string,
    orderId: string,
    input: {
      destinationCountry?: string;
      allocations: Array<{ orderItemId: string; nodeId: string }>;
      reason?: string;
    },
  ) {
    const { lines } = await this.loadRoutableOrder(businessId, orderId);
    const context = await this.loadContext(
      businessId,
      lines.map((line) => line.productId),
    );
    const destinationCountry = input.destinationCountry
      ? input.destinationCountry.toUpperCase()
      : null;
    const evaluation = this.evaluate(lines, context, destinationCountry);

    const byLine = new Map<string, string>();
    for (const allocation of input.allocations) {
      if (byLine.has(allocation.orderItemId)) {
        throw new AppException(
          CODES.INVALID_ALLOCATION,
          'Each order line can be allocated once.',
          HttpStatus.BAD_REQUEST,
        );
      }
      byLine.set(allocation.orderItemId, allocation.nodeId);
    }
    if (
      byLine.size !== lines.length ||
      lines.some((line) => !byLine.has(line.orderItemId))
    ) {
      throw new AppException(
        CODES.INVALID_ALLOCATION,
        'Allocate every physical product line of this order exactly once.',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const line of lines) {
      const nodeId = byLine.get(line.orderItemId)!;
      const check = evaluation.nodes
        .find((node) => node.nodeId === nodeId)
        ?.lines.find((item) => item.orderItemId === line.orderItemId);
      if (!check?.eligible) {
        throw new AppException(
          CODES.NODE_NOT_ELIGIBLE,
          check
            ? `That node can't fulfil "${line.name}": ${check.reasons.join('; ')}.`
            : `That node is not an active fulfilment node for "${line.name}".`,
          HttpStatus.CONFLICT,
        );
      }
    }
    const recommended = new Map(
      (evaluation.recommendation?.allocations ?? []).map((row) => [
        row.orderItemId,
        row.nodeId,
      ]),
    );
    const overrode = lines.some(
      (line) =>
        recommended.get(line.orderItemId) !== byLine.get(line.orderItemId),
    );
    const reason = input.reason?.trim() || null;
    if (overrode && (!reason || reason.length < 3)) {
      throw new AppException(
        CODES.OVERRIDE_REASON_REQUIRED,
        'Give a reason for choosing a route other than the recommendation.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const mode =
      new Set(byLine.values()).size > 1
        ? CommerceRoutingMode.split
        : CommerceRoutingMode.single;

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const previous = await tx.commerceRoutingDecision.findMany({
        where: {
          businessId,
          orderId,
          status: CommerceRoutingDecisionStatus.active,
        },
        select: { id: true },
      });
      if (previous.length) {
        await tx.commerceRoutingDecision.updateMany({
          where: { businessId, id: { in: previous.map((row) => row.id) } },
          data: {
            status: CommerceRoutingDecisionStatus.superseded,
            endedAt: new Date(),
            endedReason: 'Rerouted',
          },
        });
      }
      const decision = await tx.commerceRoutingDecision.create({
        data: {
          businessId,
          orderId,
          mode,
          destinationCountry,
          policyVersion: COMMERCE_ROUTING_POLICY_VERSION,
          recommendedNodeIds: [
            ...new Set(recommended.values()),
          ] as Prisma.InputJsonValue,
          overrodeRecommendation: overrode,
          reason,
          evidence: evaluation as unknown as Prisma.InputJsonValue,
          decidedByUserId: actorUserId,
          allocations: {
            create: lines.map((line) => ({
              businessId,
              orderItemId: line.orderItemId,
              nodeId: byLine.get(line.orderItemId)!,
              qty: line.qty,
            })),
          },
        },
        include: { allocations: true },
      });
      await tx.commerceFulfillmentAudit.create({
        data: {
          businessId,
          action: 'route_assigned',
          reason,
          actorUserId,
          after: {
            orderId,
            decisionId: decision.id,
            mode,
            overrodeRecommendation: overrode,
            supersededDecisionIds: previous.map((row) => row.id),
            policyVersion: COMMERCE_ROUTING_POLICY_VERSION,
          } as Prisma.InputJsonValue,
        },
      });
      return decision;
    });
  }

  async cancel(
    businessId: string,
    actorUserId: string,
    decisionId: string,
    reason: string,
  ) {
    const decision =
      await this.tenantPrisma.client.commerceRoutingDecision.findFirst({
        where: {
          id: decisionId,
          businessId,
          status: CommerceRoutingDecisionStatus.active,
        },
      });
    if (!decision) {
      throw new AppException(
        CODES.DECISION_NOT_FOUND,
        'Active route was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.commerceRoutingDecision.update({
        where: { id: decisionId, businessId },
        data: {
          status: CommerceRoutingDecisionStatus.cancelled,
          endedAt: new Date(),
          endedReason: reason.trim(),
        },
      });
      await tx.commerceFulfillmentAudit.create({
        data: {
          businessId,
          action: 'route_cancelled',
          reason: reason.trim(),
          actorUserId,
          after: {
            orderId: decision.orderId,
            decisionId,
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  /** All decisions (active and past) for one order, newest first. */
  async history(businessId: string, orderId: string) {
    return this.tenantPrisma.client.commerceRoutingDecision.findMany({
      where: { businessId, orderId },
      include: {
        allocations: {
          select: {
            orderItemId: true,
            qty: true,
            node: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
