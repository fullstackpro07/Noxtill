import { Injectable } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { calculateReorder } from './reorder-calculation.util';
import {
  applyMinimumReorderQty,
  roundUpToPurchasePack,
} from './purchase-pack.util';
import { PoliciesService } from '../common/policies/policies.service';
import {
  REORDER_LEAD_TIME_DAYS,
  REORDER_VELOCITY_WINDOW_DAYS,
  UNASSIGNED_SUPPLIER_KEY,
} from './reorder-suggestions.constants';
import { branchTransferAvailability } from './branch-transfer-availability.util';

interface VelocityRow {
  id: string;
  name: string;
  sku: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  stock_unit_label: string | null;
  purchase_unit_label: string | null;
  purchase_pack_size: number | null;
  minimum_reorder_qty: number | null;
  units_sold: bigint | number;
}

interface LastSupplierRow {
  product_id: string;
  supplier_id: string;
}

export interface ReorderSuggestionItem {
  productId: string;
  name: string;
  sku: string | null;
  currentStock: number;
  lowStockThreshold: number;
  velocityPerDay: number;
  baseSuggestedQty: number;
  incomingPurchaseQty: number;
  incomingTransferQty: number;
  committedOutboundTransferQty: number;
  availableStockAfterOutboundTransfers: number;
  unroundedAdditionalQty: number;
  minimumReorderQty: number | null;
  suggestedQty: number;
  purchasePackSize: number | null;
  purchasePackCount: number | null;
  stockUnitLabel: string | null;
  purchaseUnitLabel: string | null;
  baselineLeadTimeDays: number;
}

export interface ReorderSuggestionGroup {
  supplierId: string;
  supplierName: string;
  items: ReorderSuggestionItem[];
  totalSuggestedQty: number;
}

/**
 * Reorder Suggestions, formalized (UPD-BE-077) — extends the same low-stock detection query
 * `LowStockScanProcessor` already runs, adding real sales-velocity math: `suggestedQty` covers
 * both what the real lead time will consume AND rebuilding back above the safety threshold, not
 * just "top up to the threshold." Grouped by supplier via each product's most recent real
 * `purchase`-kind `StockMovement` (there's no formal product→supplier assignment in this schema
 * yet — this is a real, deterministic "who did we last buy this from" inference, not a guess).
 */
@Injectable()
export class ReorderSuggestionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly policies: PoliciesService,
    private readonly prisma: PrismaService,
  ) {}

  async list(
    businessId: string,
    configuredLeadTimeDays?: number,
    options: { includeCovered?: boolean } = {},
  ): Promise<ReorderSuggestionGroup[]> {
    const leadTimeDays =
      configuredLeadTimeDays ??
      (await this.policies
        .forBusiness(businessId)
        .then((policy) => policy.num('inventory.agentReorderLeadTimeDays'))) ??
      REORDER_LEAD_TIME_DAYS;
    const cutoff = new Date(
      Date.now() - REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const rows = await this.tenantPrisma.client.$queryRaw<VelocityRow[]>`
      SELECT p.id, p.name, p.sku, p.stock_qty, p.low_stock_threshold,
        p.stock_unit_label, p.purchase_unit_label, p.purchase_pack_size,
        p.minimum_reorder_qty,
        COALESCE(SUM(CASE WHEN sm.kind = 'sale' AND sm.created_at >= ${cutoff} THEN -sm.qty ELSE 0 END), 0) AS units_sold
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.business_id = p.business_id
      WHERE p.business_id = ${businessId} AND p.active = true AND p.kind = 'product'
      GROUP BY p.id, p.name, p.sku, p.stock_qty, p.low_stock_threshold,
        p.stock_unit_label, p.purchase_unit_label, p.purchase_pack_size,
        p.minimum_reorder_qty
    `;

    const productIds = rows.map((row) => row.id);
    const incomingByProduct = new Map<string, number>();
    const transferAvailability = await branchTransferAvailability(
      this.prisma,
      businessId,
      rows.map(({ id, sku }) => ({ id, sku })),
    );
    if (productIds.length > 0) {
      const openOrders = await this.tenantPrisma.client.purchaseOrder.findMany({
        where: {
          businessId,
          status: {
            in: [
              PurchaseOrderStatus.sent,
              PurchaseOrderStatus.confirmed,
              PurchaseOrderStatus.partially_received,
            ],
          },
          items: { some: { productId: { in: productIds } } },
        },
        orderBy: [{ id: 'asc' }],
        select: {
          items: {
            where: { productId: { in: productIds } },
            orderBy: [{ id: 'asc' }],
            select: { productId: true, qtyOrdered: true, qtyReceived: true },
          },
        },
      });
      for (const order of openOrders) {
        for (const item of order.items) {
          if (!item.productId) continue;
          const outstanding = Math.max(0, item.qtyOrdered - item.qtyReceived);
          incomingByProduct.set(
            item.productId,
            (incomingByProduct.get(item.productId) ?? 0) + outstanding,
          );
        }
      }
    }

    const items: (ReorderSuggestionItem & { productId: string })[] = [];
    for (const row of rows) {
      const {
        velocityPerDay,
        suggestedQty: calculatedSuggestedQty,
      } = calculateReorder(
        Number(row.units_sold),
        Math.max(
          0,
          row.stock_qty -
            (transferAvailability.get(row.id)?.committedOutboundQty ?? 0),
        ),
        row.low_stock_threshold,
        leadTimeDays,
      );
      const baseSuggestedQty = Math.max(0, calculatedSuggestedQty);
      if (baseSuggestedQty <= 0) continue;
      const incomingPurchaseQty = incomingByProduct.get(row.id) ?? 0;
      const incomingTransferQty =
        transferAvailability.get(row.id)?.incomingQty ?? 0;
      const committedOutboundTransferQty =
        transferAvailability.get(row.id)?.committedOutboundQty ?? 0;
      const availableStockAfterOutboundTransfers = Math.max(
        0,
        row.stock_qty - committedOutboundTransferQty,
      );
      const unroundedAdditionalQty = Math.max(
        0,
        baseSuggestedQty - incomingPurchaseQty - incomingTransferQty,
      );
      if (unroundedAdditionalQty <= 0 && !options.includeCovered) continue;
      const minimumAdjustedQty = applyMinimumReorderQty(
        unroundedAdditionalQty,
        row.minimum_reorder_qty,
      );
      const rounded = roundUpToPurchasePack(
        minimumAdjustedQty,
        row.purchase_pack_size,
      );

      items.push({
        productId: row.id,
        name: row.name,
        sku: row.sku,
        currentStock: row.stock_qty,
        lowStockThreshold: row.low_stock_threshold,
        velocityPerDay,
        baseSuggestedQty,
        incomingPurchaseQty,
        incomingTransferQty,
        committedOutboundTransferQty,
        availableStockAfterOutboundTransfers,
        unroundedAdditionalQty,
        minimumReorderQty: row.minimum_reorder_qty,
        suggestedQty: rounded.stockQuantity,
        purchasePackSize: row.purchase_pack_size,
        purchasePackCount: rounded.purchaseUnitCount,
        stockUnitLabel: row.stock_unit_label,
        purchaseUnitLabel: row.purchase_unit_label,
        baselineLeadTimeDays: leadTimeDays,
      });
    }
    if (items.length === 0) return [];

    const supplierByProduct = await this.mostRecentSupplierByProduct(
      businessId,
      items.map((i) => i.productId),
    );

    const supplierIds = [...new Set(Object.values(supplierByProduct))];
    const suppliers = supplierIds.length
      ? await this.tenantPrisma.client.supplier.findMany({
          where: { id: { in: supplierIds } },
        })
      : [];
    const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

    const groups = new Map<string, ReorderSuggestionGroup>();
    for (const item of items) {
      const supplierId =
        supplierByProduct[item.productId] ?? UNASSIGNED_SUPPLIER_KEY;
      const supplierName =
        supplierId === UNASSIGNED_SUPPLIER_KEY
          ? 'No supplier on record'
          : (supplierNameById.get(supplierId) ?? 'Unknown supplier');

      const group = groups.get(supplierId) ?? {
        supplierId,
        supplierName,
        items: [],
        totalSuggestedQty: 0,
      };
      group.items.push(item);
      group.totalSuggestedQty += item.suggestedQty;
      groups.set(supplierId, group);
    }

    return [...groups.values()].sort(
      (a, b) => b.totalSuggestedQty - a.totalSuggestedQty,
    );
  }

  /** Real "last purchased from" inference — most recent `purchase` movement with a supplier attached, per product. */
  private async mostRecentSupplierByProduct(
    businessId: string,
    productIds: string[],
  ): Promise<Record<string, string>> {
    const rows = await this.tenantPrisma.client.$queryRaw<LastSupplierRow[]>(
      Prisma.sql`
        SELECT sm1.product_id, sm1.supplier_id
        FROM stock_movements sm1
        INNER JOIN (
          SELECT product_id, MAX(created_at) AS max_created_at
          FROM stock_movements
          WHERE business_id = ${businessId} AND kind = 'purchase' AND supplier_id IS NOT NULL
            AND product_id IN (${Prisma.join(productIds)})
          GROUP BY product_id
        ) latest ON latest.product_id = sm1.product_id AND latest.max_created_at = sm1.created_at
        WHERE sm1.business_id = ${businessId} AND sm1.kind = 'purchase' AND sm1.supplier_id IS NOT NULL
      `,
    );
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.product_id] = row.supplier_id;
    }
    return result;
  }
}
