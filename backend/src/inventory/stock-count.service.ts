import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ActivityService } from '../activity/activity.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { STOCK_COUNT_ERROR_CODES } from './inventory.constants';
import {
  ProductKind,
  StockCountStatus,
  StockMovementKind,
} from '../../generated/prisma';

/**
 * Stock Count (UPD-BE-037). `create()` is a draft — it snapshots expected/counted/variance for
 * preview but never touches `Product.stockQty` or writes a `StockMovement`, same "raise a
 * proposal" shape as `Return`/`StockTransfer`. `apply()` is the one moment real stock moves: it
 * re-derives variance against the LIVE `Product.stockQty` (not the stale creation-time snapshot,
 * in case real sales/other movements happened in between) and writes one real `adjustment`
 * `StockMovement` per line that still has a nonzero variance.
 */
@Injectable()
export class StockCountService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateStockCountDto,
  ) {
    const productIds = dto.lines.map((l) => l.productId);
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds }, kind: ProductKind.product },
    });
    if (products.length !== new Set(productIds).size) {
      throw new AppException(
        STOCK_COUNT_ERROR_CODES.ITEM_NOT_FOUND,
        'One or more items are not real physical products of this business',
        HttpStatus.BAD_REQUEST,
      );
    }
    const productMap = new Map(products.map((p) => [p.id, p]));

    return this.tenantPrisma.client.stockCount.create({
      data: {
        businessId,
        note: dto.note,
        createdByUserId: actorUserId,
        lines: {
          create: dto.lines.map((line) => {
            const product = productMap.get(line.productId)!;
            return {
              productId: line.productId,
              expectedQty: product.stockQty,
              countedQty: line.countedQty,
              variance: line.countedQty - product.stockQty,
            };
          }),
        },
      },
      include: { lines: { include: { product: true } } },
    });
  }

  list(status?: StockCountStatus) {
    return this.tenantPrisma.client.stockCount.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { lines: { include: { product: true } } },
    });
  }

  async findOne(id: string) {
    const count = await this.tenantPrisma.client.stockCount.findUnique({
      where: { id },
      include: { lines: { include: { product: true } } },
    });
    if (!count) {
      throw new NotFoundException('Stock count not found');
    }
    return count;
  }

  async apply(businessId: string, id: string, actorUserId: string) {
    const count = await this.findOne(id);
    if (count.status !== StockCountStatus.draft) {
      throw new AppException(
        STOCK_COUNT_ERROR_CODES.ALREADY_APPLIED,
        `Stock count is already "${count.status}"`,
        HttpStatus.CONFLICT,
      );
    }

    let adjustedLines = 0;
    const applied = await this.tenantPrisma.client.$transaction(async (tx) => {
      for (const line of count.lines) {
        const liveProduct = await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
        });
        const liveVariance = line.countedQty - liveProduct.stockQty;
        if (liveVariance === 0) continue;

        adjustedLines += 1;
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: line.countedQty },
        });
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: line.productId,
            kind: StockMovementKind.adjustment,
            qty: liveVariance,
            reason: `Stock count ${id}: ${liveProduct.stockQty} -> ${line.countedQty}`,
          },
        });
      }

      return tx.stockCount.update({
        where: { id },
        data: {
          status: StockCountStatus.applied,
          appliedByUserId: actorUserId,
          appliedAt: new Date(),
        },
      });
    });

    await this.activity.record(businessId, {
      type: 'stock',
      description: `Stock count applied — ${adjustedLines} item(s) adjusted`,
      entityType: 'StockCount',
      entityId: id,
      actorUserId,
    });

    return applied;
  }
}
