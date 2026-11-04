import { createHash } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus, StockMovementKind } from '@prisma/client';
import { AppException } from '../filters/app.exception';
import { CAPABILITIES } from '../capabilities/capabilities.constants';
import { PoliciesService, resolvePolicies } from '../policies/policies.service';
import { parseDisabled } from '../../business-modules/business-modules.service';
import { calculateReorder } from '../../inventory/reorder-calculation.util';
import {
  applyMinimumReorderQty,
  roundUpToPurchasePack,
} from '../../inventory/purchase-pack.util';
import { REORDER_VELOCITY_WINDOW_DAYS } from '../../inventory/reorder-suggestions.constants';
import { branchTransferAvailability } from '../../inventory/branch-transfer-availability.util';
import type { TenantPrismaService } from '../tenancy/tenant-prisma.service';

/** Preserve the tenant extension's delegate types inside interactive transactions. */
export type AgentDataClient = Omit<
  TenantPrismaService['client'],
  '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends' | '$use'
>;

export const INVENTORY_HANDOFF_VALIDITY_MS = 24 * 60 * 60 * 1000;
export type AgentPurchaseRequest = Prisma.ProcurementRequestGetPayload<{
  include: { items: true };
}>;
export type InventoryHandoffContext = {
  actionType: 'inventory_reorder_request';
  schemaVersion: 1;
  productId: string;
  sourceHash: string;
  payloadHash: string;
  preparedAt: string;
  expiresAt: string;
  source: Prisma.InputJsonObject;
};

export function agentHandoffError(code: string, message: string) {
  return new AppException(code, message, HttpStatus.CONFLICT);
}

function orderedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, orderedJson(entry)]),
    );
  }
  return value;
}

export function agentPayloadHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(orderedJson(value)))
    .digest('hex');
}

/** Hash the exact canonical preview, including its optimistic version and decimal units. */
export function purchaseRequestPayloadHash(request: AgentPurchaseRequest) {
  return agentPayloadHash({
    businessId: request.businessId,
    version: request.version,
    branchBusinessId: request.branchBusinessId,
    supplierId: request.supplierId,
    reason: request.reason,
    department: request.department,
    costCenter: request.costCenter,
    neededBy: request.neededBy?.toISOString() ?? null,
    urgency: request.urgency,
    budgetCode: request.budgetCode,
    currency: request.currency,
    attachmentUrls: request.attachmentUrls,
    items: request.items
      .map((item) => ({
        productId: item.productId,
        lineType: item.lineType,
        description: item.description,
        category: item.category,
        quantity: item.quantity.toFixed(3),
        estimatedUnitCost: item.estimatedUnitCost.toFixed(2),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

export function readInventoryHandoffContext(
  value: Prisma.JsonValue | null,
): InventoryHandoffContext {
  const context = value as unknown as InventoryHandoffContext | null;
  if (
    !context ||
    context.schemaVersion !== 1 ||
    context.actionType !== 'inventory_reorder_request' ||
    typeof context.productId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(context.sourceHash) ||
    !/^[a-f0-9]{64}$/.test(context.payloadHash) ||
    !Number.isFinite(Date.parse(context.expiresAt))
  ) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_CONTEXT_INVALID',
      'The agent handoff has invalid review evidence. Run Inventory analysis again.',
    );
  }
  return context;
}

export async function assertInventoryHandoffEnabled(
  client: AgentDataClient,
  businessId: string,
  policies: PoliciesService,
) {
  const [business, canRun, canPurchase] = await Promise.all([
    client.business.findUnique({
      where: { id: businessId },
      select: {
        active: true,
        policies: true,
        currency: true,
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    }),
    policies.actorCan(CAPABILITIES.INVENTORY_AGENT_RUN),
    policies.actorCan(CAPABILITIES.PURCHASES_MANAGE),
  ]);
  if (!canRun || !canPurchase) {
    throw new AppException(
      'SPECIALIST_ACTION_FORBIDDEN',
      'Inventory agent and purchase-management permissions are required for this handoff.',
      HttpStatus.FORBIDDEN,
    );
  }
  if (
    !business?.active ||
    !resolvePolicies(business).bool('agents.inventoryEnabled')
  ) {
    throw agentHandoffError(
      'SPECIALIST_AGENT_DISABLED',
      'Inventory Intelligence Agent is disabled.',
    );
  }
  const disabled = parseDisabled(
    business.parentId
      ? business.parent?.disabledModules
      : business.disabledModules,
  );
  if (disabled.includes('inventory') || disabled.includes('procurement')) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_MODULE_DISABLED',
      'Inventory and Procurement must be enabled before this handoff can proceed.',
    );
  }
  return business;
}

/** Pins the stock/sales calculation plus open-PO offset used by the Inventory Agent; no stock is written. */
export async function inventoryReorderSource(
  client: AgentDataClient,
  businessId: string,
  productId: string,
  leadTimeDays = 14,
) {
  await client.$queryRaw`
    SELECT id FROM products WHERE business_id = ${businessId} AND id = ${productId} FOR UPDATE
  `;
  const product = await client.product.findFirst({
    where: { id: productId, businessId, active: true, kind: 'product' },
  });
  if (!product)
    throw agentHandoffError(
      'SPECIALIST_ACTION_SOURCE_CHANGED',
      'The source product is no longer available. Run Inventory analysis again.',
    );
  const cutoff = new Date(
    Date.now() - REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const [sales, incoming] = await Promise.all([
    client.stockMovement.aggregate({
      where: {
        businessId,
        productId,
        kind: StockMovementKind.sale,
        createdAt: { gte: cutoff },
      },
      _sum: { qty: true },
      _count: { _all: true },
      _max: { createdAt: true, id: true },
    }),
    client.purchaseOrder.findMany({
      where: {
        businessId,
        status: {
          in: [
            PurchaseOrderStatus.sent,
            PurchaseOrderStatus.confirmed,
            PurchaseOrderStatus.partially_received,
          ],
        },
        items: { some: { productId } },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        items: {
          where: { productId },
          orderBy: { id: 'asc' },
          select: { id: true, qtyOrdered: true, qtyReceived: true },
        },
      },
    }),
  ]);
  const transferAvailability = await branchTransferAvailability(
    client as unknown as Prisma.TransactionClient,
    businessId,
    [{ id: product.id, sku: product.sku }],
  );
  const transfers = transferAvailability.get(product.id) ?? {
    committedOutboundQty: 0,
    incomingQty: 0,
  };
  const unitsSold = -(sales._sum.qty ?? 0);
  const baseCalculation = calculateReorder(
    unitsSold,
    Math.max(0, product.stockQty - transfers.committedOutboundQty),
    product.lowStockThreshold,
    leadTimeDays,
  );
  const incomingPurchaseQty = incoming.reduce(
    (total, order) =>
      total +
      order.items.reduce(
        (orderTotal, item) =>
          orderTotal + Math.max(0, item.qtyOrdered - item.qtyReceived),
        0,
      ),
    0,
  );
  const baseSuggestedQty = Math.max(0, baseCalculation.suggestedQty);
  const unroundedAdditionalQty = Math.max(
    0,
    baseSuggestedQty - incomingPurchaseQty - transfers.incomingQty,
  );
  const minimumAdjustedQty = applyMinimumReorderQty(
    unroundedAdditionalQty,
    product.minimumReorderQty,
  );
  const roundedAdditionalQty = roundUpToPurchasePack(
    minimumAdjustedQty,
    product.purchasePackSize,
  );
  const calculation = {
    ...baseCalculation,
    baseSuggestedQty,
    incomingPurchaseQty,
    incomingTransferQty: transfers.incomingQty,
    incomingSupplyQty: incomingPurchaseQty + transfers.incomingQty,
    committedOutboundTransferQty: transfers.committedOutboundQty,
    availableStockAfterOutboundTransfers: Math.max(
      0,
      product.stockQty - transfers.committedOutboundQty,
    ),
    unroundedAdditionalQty,
    minimumAdjustedQty,
    suggestedQty: roundedAdditionalQty.stockQuantity,
    purchaseUnitCount: roundedAdditionalQty.purchaseUnitCount,
  };
  const source = {
    productId,
    productName: product.name,
    sku: product.sku,
    category: product.category,
    stockUnitLabel: product.stockUnitLabel,
    purchaseUnitLabel: product.purchaseUnitLabel,
    purchasePackSize: product.purchasePackSize,
    minimumReorderQty: product.minimumReorderQty,
    currentStock: product.stockQty,
    lowStockThreshold: product.lowStockThreshold,
    estimatedUnitCost: product.costPrice.toFixed(2),
    salesWindowDays: REORDER_VELOCITY_WINDOW_DAYS,
    baselineLeadTimeDays: leadTimeDays,
    unitsSold,
    saleMovementCount: sales._count._all,
    lastSaleAt: sales._max.createdAt?.toISOString() ?? null,
    lastSaleId: sales._max.id,
    incoming,
    branchTransfers: {
      committedOutboundQty: transfers.committedOutboundQty,
      incomingQty: transfers.incomingQty,
    },
    ...calculation,
  } satisfies Prisma.InputJsonObject;
  return { product, calculation, source, sourceHash: agentPayloadHash(source) };
}

export async function assertInventoryAgentRequestCurrent(
  client: AgentDataClient,
  request: AgentPurchaseRequest,
  policies: PoliciesService,
) {
  if (!request.sourceAgentRecommendationId && request.agentContext === null)
    return null;
  const context = readInventoryHandoffContext(request.agentContext);
  if (!request.sourceAgentRecommendationId) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_CONTEXT_INVALID',
      'The agent source reference is missing. Prepare a new request.',
    );
  }
  await assertInventoryHandoffEnabled(client, request.businessId, policies);
  if (Date.parse(context.expiresAt) <= Date.now()) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_EXPIRED',
      'This Inventory proposal has expired. Run analysis again and prepare a fresh request.',
    );
  }
  if (purchaseRequestPayloadHash(request) !== context.payloadHash) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_PREVIEW_CHANGED',
      'The purchase preview changed. Save and review a new draft before approval.',
    );
  }
  const policiesForBusiness = await policies.forBusiness(request.businessId);
  const leadTimeDays =
    policiesForBusiness.num('inventory.agentReorderLeadTimeDays') ?? 14;
  const current = await inventoryReorderSource(
    client,
    request.businessId,
    context.productId,
    leadTimeDays,
  );
  if (current.sourceHash !== context.sourceHash) {
    throw agentHandoffError(
      'SPECIALIST_ACTION_SOURCE_CHANGED',
      'Stock, sales, estimated cost or outstanding purchases changed. Run Inventory analysis again before continuing.',
    );
  }
  return context;
}
