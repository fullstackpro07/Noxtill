import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  REORDER_LEAD_TIME_DAYS,
  REORDER_VELOCITY_WINDOW_DAYS,
  UNASSIGNED_SUPPLIER_KEY,
} from './reorder-suggestions.constants';

interface VelocityRow {
  id: string;
  name: string;
  sku: string | null;
  stock_qty: number;
  low_stock_threshold: number;
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
  velocityPerDay: number;
  suggestedQty: number;
}

export interface ReorderSuggestionGroup {
  supplierId: string;
  supplierName: string;
  items: ReorderSuggestionItem[];
  totalSuggestedQty: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string): Promise<ReorderSuggestionGroup[]> {
    const cutoff = new Date(
      Date.now() - REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const rows = await this.tenantPrisma.client.$queryRaw<VelocityRow[]>`
      SELECT p.id, p.name, p.sku, p.stock_qty, p.low_stock_threshold,
        COALESCE(SUM(CASE WHEN sm.kind = 'sale' AND sm.created_at >= ${cutoff} THEN -sm.qty ELSE 0 END), 0) AS units_sold
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.business_id = p.business_id
      WHERE p.business_id = ${businessId} AND p.active = true AND p.kind = 'product'
      GROUP BY p.id, p.name, p.sku, p.stock_qty, p.low_stock_threshold
    `;

    const items: (ReorderSuggestionItem & { productId: string })[] = [];
    for (const row of rows) {
      const velocityPerDay =
        Number(row.units_sold) / REORDER_VELOCITY_WINDOW_DAYS;
      const suggestedQty = Math.ceil(
        velocityPerDay * REORDER_LEAD_TIME_DAYS +
          row.low_stock_threshold -
          row.stock_qty,
      );
      if (suggestedQty <= 0) continue;

      items.push({
        productId: row.id,
        name: row.name,
        sku: row.sku,
        currentStock: row.stock_qty,
        velocityPerDay: round2(velocityPerDay),
        suggestedQty,
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
