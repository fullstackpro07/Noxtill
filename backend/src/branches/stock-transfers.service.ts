import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { STOCK_TRANSFER_ERROR_CODES } from './stock-transfers.constants';
import { StockMovementKind, StockTransferStatus } from '@prisma/client';

/**
 * Narrow shape actually used by `resolveDestProduct` — satisfied structurally by both the raw
 * `PrismaService` (approve()'s validation pass) and the `$transaction` callback's `tx` client
 * (receive()'s real write), same hand-written-subset pattern as `CouponsService.CouponTxClient`.
 */
interface ProductReader {
  product: {
    findFirst(args: {
      where: { businessId: string; sku: string };
    }): Promise<{ id: string; stockQty: number } | null>;
  };
}

/**
 * Stock Transfers (UPD-BE-036) — deliberately uses the raw `PrismaService`, not
 * `TenantPrismaService`, throughout: a transfer inherently spans two businesses (source and
 * destination branch), and the CLS-based tenant-scoping extension would force every query to the
 * caller's own business only. Same "explicit scoping, no CLS" convention as `RollupService`, the
 * only other code in this codebase that reads across branches.
 *
 * Branches don't share product identity — `Product.businessId` is a hard per-business scalar, so
 * branch A's "Widget" and branch B's "Widget" are two entirely separate rows. The destination
 * product is matched by SKU, validated once upfront at `approve()` (so a transfer never ships if
 * receiving it would be impossible) and re-checked defensively at `receive()`.
 */
@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    sourceBusinessId: string,
    actorUserId: string,
    dto: CreateStockTransferDto,
  ) {
    await this.assertSameBranchGroup(sourceBusinessId, dto.destBusinessId);

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId: sourceBusinessId },
    });
    if (products.length !== new Set(productIds).size) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.ITEM_NOT_FOUND,
        'One or more items are not real products of the source branch',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.stockTransfer.create({
      data: {
        sourceBusinessId,
        destBusinessId: dto.destBusinessId,
        note: dto.note,
        requestedByUserId: actorUserId,
        items: {
          create: dto.items.map((i) => ({
            sourceProductId: i.productId,
            qty: i.qty,
          })),
        },
      },
      include: { items: { include: { sourceProduct: true } } },
    });
  }

  list(businessId: string, status?: StockTransferStatus) {
    return this.prisma.stockTransfer.findMany({
      where: {
        OR: [{ sourceBusinessId: businessId }, { destBusinessId: businessId }],
        status,
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { sourceProduct: true } } },
    });
  }

  async findOne(businessId: string, id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: { include: { sourceProduct: true } } },
    });
    if (
      !transfer ||
      (transfer.sourceBusinessId !== businessId &&
        transfer.destBusinessId !== businessId)
    ) {
      throw new NotFoundException('Stock transfer not found');
    }
    return transfer;
  }

  /** Validates every item has a real matching destination-branch product by SKU before approving. */
  async approve(businessId: string, id: string, actorUserId: string) {
    const transfer = await this.findWithStatus(
      businessId,
      id,
      StockTransferStatus.pending,
    );
    this.assertSourceCaller(transfer, businessId);

    for (const item of transfer.items) {
      await this.resolveDestProduct(
        transfer.destBusinessId,
        item.sourceProduct,
      );
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: StockTransferStatus.approved,
        approvedByUserId: actorUserId,
      },
      include: { items: { include: { sourceProduct: true } } },
    });
  }

  /** Real stock leaves the source branch here — decrements source stock, writes a real `transfer_out` StockMovement. */
  async ship(businessId: string, id: string, actorUserId: string) {
    const transfer = await this.findWithStatus(
      businessId,
      id,
      StockTransferStatus.approved,
    );
    this.assertSourceCaller(transfer, businessId);

    for (const item of transfer.items) {
      if (item.sourceProduct.stockQty < item.qty) {
        throw new AppException(
          STOCK_TRANSFER_ERROR_CODES.INSUFFICIENT_STOCK,
          `Insufficient stock for "${item.sourceProduct.name}" (have ${item.sourceProduct.stockQty}, need ${item.qty})`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.product.update({
          where: { id: item.sourceProductId },
          data: { stockQty: { decrement: item.qty } },
        });
        await tx.stockMovement.create({
          data: {
            businessId: transfer.sourceBusinessId,
            productId: item.sourceProductId,
            kind: StockMovementKind.transfer_out,
            qty: -item.qty,
            reason: `Stock transfer ${transfer.id} to branch ${transfer.destBusinessId}`,
          },
        });
      }
      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.shipped,
          shippedByUserId: actorUserId,
        },
        include: { items: { include: { sourceProduct: true } } },
      });
    });
  }

  /** Real stock arrives at the destination branch here — the cross-business side of the write. */
  async receive(businessId: string, id: string, actorUserId: string) {
    const transfer = await this.findWithStatus(
      businessId,
      id,
      StockTransferStatus.shipped,
    );
    this.assertDestCaller(transfer, businessId);

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const destProduct = await this.resolveDestProduct(
          transfer.destBusinessId,
          item.sourceProduct,
          tx,
        );
        await tx.product.update({
          where: { id: destProduct.id },
          data: { stockQty: { increment: item.qty } },
        });
        await tx.stockMovement.create({
          data: {
            businessId: transfer.destBusinessId,
            productId: destProduct.id,
            kind: StockMovementKind.transfer_in,
            qty: item.qty,
            reason: `Stock transfer ${transfer.id} from branch ${transfer.sourceBusinessId}`,
          },
        });
      }
      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.received,
          receivedByUserId: actorUserId,
        },
        include: { items: { include: { sourceProduct: true } } },
      });
    });
  }

  async reject(
    businessId: string,
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
    const transfer = await this.findOne(businessId, id);
    if (
      transfer.status !== StockTransferStatus.pending &&
      transfer.status !== StockTransferStatus.approved
    ) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.NOT_CANCELLABLE,
        `A "${transfer.status}" transfer can no longer be rejected`,
        HttpStatus.CONFLICT,
      );
    }
    this.assertSourceCaller(transfer, businessId);

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: StockTransferStatus.rejected,
        note: reason
          ? `${transfer.note ?? ''}\n\nRejected: ${reason}`.trim()
          : transfer.note,
        approvedByUserId: actorUserId,
      },
      include: { items: { include: { sourceProduct: true } } },
    });
  }

  private async resolveDestProduct(
    destBusinessId: string,
    sourceProduct: { name: string; sku: string | null },
    client: ProductReader = this.prisma,
  ) {
    if (!sourceProduct.sku) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.NO_SKU,
        `"${sourceProduct.name}" has no SKU — cannot match it to a destination-branch product`,
        HttpStatus.CONFLICT,
      );
    }
    const destProduct = await client.product.findFirst({
      where: { businessId: destBusinessId, sku: sourceProduct.sku },
    });
    if (!destProduct) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.NO_DEST_MATCH,
        `No product with SKU "${sourceProduct.sku}" exists in the destination branch — create it there first`,
        HttpStatus.CONFLICT,
      );
    }
    return destProduct;
  }

  private async findWithStatus(
    businessId: string,
    id: string,
    expectedStatus: StockTransferStatus,
  ) {
    const transfer = await this.findOne(businessId, id);
    if (transfer.status !== expectedStatus) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.WRONG_STATUS,
        `Transfer is "${transfer.status}", expected "${expectedStatus}"`,
        HttpStatus.CONFLICT,
      );
    }
    return transfer;
  }

  private assertSourceCaller(
    transfer: { sourceBusinessId: string },
    businessId: string,
  ) {
    if (transfer.sourceBusinessId !== businessId) {
      throw new ForbiddenException(
        'Only the source branch can perform this action',
      );
    }
  }

  private assertDestCaller(
    transfer: { destBusinessId: string },
    businessId: string,
  ) {
    if (transfer.destBusinessId !== businessId) {
      throw new ForbiddenException(
        'Only the destination branch can perform this action',
      );
    }
  }

  /** The branch group a business belongs to: itself, its parent (if it's a branch), and all siblings. */
  private async assertSameBranchGroup(businessId: string, otherId: string) {
    if (businessId === otherId) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.SAME_BRANCH,
        'Source and destination must be different branches',
        HttpStatus.BAD_REQUEST,
      );
    }
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    const rootId = business.parentId ?? business.id;
    const group = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true },
    });
    if (!group.some((b) => b.id === otherId)) {
      throw new AppException(
        STOCK_TRANSFER_ERROR_CODES.NOT_SAME_GROUP,
        'Destination is not a branch of the same business group',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
