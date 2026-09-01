import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ActivityService } from '../activity/activity.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { INVENTORY_ERROR_CODES } from './inventory.constants';
import { REORDER_VELOCITY_WINDOW_DAYS } from './reorder-suggestions.constants';
import { ProductKind, StockMovementKind } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Inventory: purchases/wastage (BE-033), on-hand list + movement timeline (BE-034). */
@Injectable()
export class InventoryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
  ) {}

  async recordPurchase(businessId: string, dto: CreatePurchaseDto) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [movement] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: dto.productId,
          kind: 'purchase',
          qty: dto.qty,
          unitCost: dto.unitCost,
          supplier: dto.supplier,
        },
      }),
      this.tenantPrisma.client.product.update({
        where: { id: dto.productId },
        data: { stockQty: { increment: dto.qty }, costPrice: dto.unitCost },
      }),
    ]);

    await this.activity.record(businessId, {
      type: 'stock',
      description: `Purchase: +${dto.qty} ${product.name}`,
      entityType: 'StockMovement',
      entityId: movement.id,
    });

    return movement;
  }

  async recordWastage(businessId: string, dto: CreateWastageDto) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.stockQty < dto.qty) {
      throw new AppException(
        INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
        `Cannot waste ${dto.qty} units — only ${product.stockQty} on hand`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const reason = dto.note ? `${dto.reason}: ${dto.note}` : dto.reason;

    const [movement] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: dto.productId,
          kind: 'wastage',
          qty: -dto.qty,
          reason,
        },
      }),
      this.tenantPrisma.client.product.update({
        where: { id: dto.productId },
        data: { stockQty: { decrement: dto.qty } },
      }),
    ]);

    await this.activity.record(businessId, {
      type: 'stock',
      description: `Wastage: -${dto.qty} ${product.name}`,
      entityType: 'StockMovement',
      entityId: movement.id,
    });

    return movement;
  }

  async listInventory() {
    const products = await this.tenantPrisma.client.product.findMany({
      where: { kind: ProductKind.product },
      orderBy: { name: 'asc' },
    });

    const lastPurchases = await this.tenantPrisma.client.stockMovement.findMany(
      {
        where: {
          productId: { in: products.map((p) => p.id) },
          kind: 'purchase',
        },
        orderBy: { createdAt: 'desc' },
      },
    );
    const lastPurchaseMap = new Map<
      string,
      { at: Date; supplier: string | null }
    >();
    for (const movement of lastPurchases) {
      if (!lastPurchaseMap.has(movement.productId)) {
        lastPurchaseMap.set(movement.productId, {
          at: movement.createdAt,
          supplier: movement.supplier,
        });
      }
    }

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      stockQty: product.stockQty,
      lowStockThreshold: product.lowStockThreshold,
      costPrice: Number(product.costPrice),
      stockValue: product.stockQty * Number(product.costPrice),
      lastPurchaseAt: lastPurchaseMap.get(product.id)?.at ?? null,
      supplier: lastPurchaseMap.get(product.id)?.supplier ?? null,
      status:
        product.stockQty <= 0
          ? 'out_of_stock'
          : product.stockQty <= product.lowStockThreshold
            ? 'low_stock'
            : 'ok',
    }));
  }

  async getMovements(productId: string) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.tenantPrisma.client.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Stock Movements, cross-product (UPD-BE-110) — `resultingBalance` isn't a stored column (no
   * running-balance field exists on `StockMovement`), so it's computed here: every movement for
   * the filtered product(s) is replayed oldest-first per product against that product's real
   * current `stockQty`, walked backwards, so the balance shown next to each row is what stock
   * genuinely was immediately after that movement posted — not an approximation.
   *
   * The balance is always computed against each product's FULL movement history, never just the
   * `kind`/date-filtered subset — otherwise filtering to e.g. `kind: 'purchase'` would silently
   * mis-slot the current live stock onto whichever movement happens to be last in the filtered
   * view, instead of that movement's own real historical balance.
   */
  async listMovements(filters: {
    productId?: string;
    kind?: StockMovementKind;
    from?: Date;
    to?: Date;
  }) {
    const [allMovements, products] = await Promise.all([
      this.tenantPrisma.client.stockMovement.findMany({
        where: { productId: filters.productId },
        orderBy: { createdAt: 'asc' },
        include: { product: true, supplierRef: true },
      }),
      this.tenantPrisma.client.product.findMany({
        select: { id: true, stockQty: true },
      }),
    ]);
    const currentStockByProduct = new Map(
      products.map((p) => [p.id, p.stockQty]),
    );

    // Walk each product's own FULL movement history oldest-first, subtracting from the current
    // live balance as we go backwards in time — the last (most recent) movement's balance equals current stock.
    const byProduct = new Map<string, typeof allMovements>();
    for (const m of allMovements) {
      const list = byProduct.get(m.productId) ?? [];
      list.push(m);
      byProduct.set(m.productId, list);
    }

    const withBalance: ((typeof allMovements)[number] & {
      resultingBalance: number;
    })[] = [];
    for (const [productId, productMovements] of byProduct) {
      let runningBalance = currentStockByProduct.get(productId) ?? 0;
      const balances = new Array<number>(productMovements.length);
      for (let i = productMovements.length - 1; i >= 0; i--) {
        balances[i] = runningBalance;
        runningBalance -= productMovements[i].qty;
      }
      productMovements.forEach((m, i) =>
        withBalance.push({ ...m, resultingBalance: balances[i] }),
      );
    }

    // Kind/date filters only decide which already-balanced rows are returned.
    const filtered = withBalance.filter(
      (m) =>
        (!filters.kind || m.kind === filters.kind) &&
        (!filters.from || m.createdAt >= filters.from) &&
        (!filters.to || m.createdAt < filters.to),
    );

    return filtered.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Low Stock, dedicated (UPD-BE-111) — same status computation as `listInventory()`, filtered to
   * below-threshold/out-of-stock only, plus a disclosed `lostSalesEstimate`: real trailing sales
   * velocity (same window/method as `ReorderSuggestionsService`) × real days spent out of stock,
   * priced at the product's own selling price — an estimate of missed revenue, not a guarantee,
   * since there's no direct "attempted sale, no stock" record in this schema.
   */
  async listLowStock() {
    const inventory = await this.listInventory();
    const belowThreshold = inventory.filter((p) => p.status !== 'ok');
    if (belowThreshold.length === 0) return [];

    const cutoff = new Date(
      Date.now() - REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const productIds = belowThreshold.map((p) => p.id);

    const [products, salesAgg, lastInStockRows] = await Promise.all([
      this.tenantPrisma.client.product.findMany({
        where: { id: { in: productIds } },
      }),
      this.tenantPrisma.client.stockMovement.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          kind: StockMovementKind.sale,
          createdAt: { gte: cutoff },
        },
        _sum: { qty: true },
      }),
      this.tenantPrisma.client.stockMovement.findMany({
        where: { productId: { in: productIds } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const unitsSoldByProduct = new Map(
      salesAgg.map((r) => [r.productId, Math.abs(r._sum.qty ?? 0)]),
    );

    // The most recent movement that brought a currently-out-of-stock product to (or through) zero —
    // real, not estimated, days-out-of-stock for products that have gone out at all in this window.
    const wentToZeroAt = new Map<string, Date>();
    for (const m of lastInStockRows) {
      if (wentToZeroAt.has(m.productId)) continue;
      const product = productById.get(m.productId);
      if (product && product.stockQty <= 0)
        wentToZeroAt.set(m.productId, m.createdAt);
    }

    return belowThreshold.map((p) => {
      const product = productById.get(p.id);
      const velocityPerDay =
        (unitsSoldByProduct.get(p.id) ?? 0) / REORDER_VELOCITY_WINDOW_DAYS;
      const zeroSince = wentToZeroAt.get(p.id);
      const daysOutOfStock = zeroSince
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - zeroSince.getTime()) / (24 * 60 * 60 * 1000),
            ),
          )
        : 0;
      const lostSalesEstimate =
        p.status === 'out_of_stock' && daysOutOfStock > 0
          ? round2(
              velocityPerDay *
                daysOutOfStock *
                Number(product?.sellingPrice ?? 0),
            )
          : 0;

      return { ...p, daysOutOfStock, lostSalesEstimate };
    });
  }
}
