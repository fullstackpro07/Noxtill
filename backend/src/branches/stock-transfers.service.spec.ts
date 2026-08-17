import { PrismaService } from '../prisma/prisma.service';
import { StockTransfersService } from './stock-transfers.service';
import { AppException } from '../common/filters/app.exception';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('StockTransfersService (UPD-BE-036)', () => {
  let prisma: PrismaService;
  let service: StockTransfersService;
  let parentId: string;
  let branchId: string;
  let unrelatedId: string;
  let sourceProductId: string;
  let destProductId: string;
  let sourceNoMatchProductId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new StockTransfersService(prisma);

    const parent = await prisma.business.create({
      data: { name: 'Parent HQ', slug: `parent-hq-${Date.now()}` },
    });
    parentId = parent.id;

    const branch = await prisma.business.create({
      data: {
        name: 'Branch A',
        slug: `branch-a-${Date.now()}`,
        parentId: parent.id,
      },
    });
    branchId = branch.id;

    const unrelated = await prisma.business.create({
      data: { name: 'Unrelated Biz', slug: `unrelated-${Date.now()}` },
    });
    unrelatedId = unrelated.id;

    const sourceProduct = await prisma.product.create({
      data: {
        businessId: parentId,
        kind: 'product',
        name: 'Widget',
        sku: 'WIDGET-1',
        stockQty: 20,
      },
    });
    sourceProductId = sourceProduct.id;

    const destProduct = await prisma.product.create({
      data: {
        businessId: branchId,
        kind: 'product',
        name: 'Widget',
        sku: 'WIDGET-1',
        stockQty: 5,
      },
    });
    destProductId = destProduct.id;

    const sourceNoMatchProduct = await prisma.product.create({
      data: {
        businessId: parentId,
        kind: 'product',
        name: 'Gadget (no branch match)',
        sku: 'GADGET-NOMATCH',
        stockQty: 10,
      },
    });
    sourceNoMatchProductId = sourceNoMatchProduct.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({
      where: { businessId: { in: [parentId, branchId] } },
    });
    await prisma.stockTransferItem.deleteMany({
      where: { transfer: { sourceBusinessId: parentId } },
    });
    await prisma.stockTransfer.deleteMany({
      where: { sourceBusinessId: parentId },
    });
    await prisma.product.deleteMany({
      where: { businessId: { in: [parentId, branchId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [parentId, branchId, unrelatedId] } },
    });
    await prisma.$disconnect();
  });

  it('rejects a transfer to a business outside the branch group', async () => {
    await expect(
      service.create(parentId, 'owner-1', {
        destBusinessId: unrelatedId,
        items: [{ productId: sourceProductId, qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a transfer to itself', async () => {
    await expect(
      service.create(parentId, 'owner-1', {
        destBusinessId: parentId,
        items: [{ productId: sourceProductId, qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an item that is not a real product of the source branch', async () => {
    await expect(
      service.create(parentId, 'owner-1', {
        destBusinessId: branchId,
        items: [{ productId: destProductId, qty: 1 }], // belongs to the branch, not the parent
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('runs a real transfer end-to-end: create -> approve -> ship -> receive, moving real stock on both branches', async () => {
    const transfer = await service.create(parentId, 'owner-1', {
      destBusinessId: branchId,
      note: 'Restocking branch A',
      items: [{ productId: sourceProductId, qty: 8 }],
    });
    expect(transfer.status).toBe('pending');

    // Only the source branch may approve.
    await expect(
      service.approve(branchId, transfer.id, 'branch-user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const approved = await service.approve(parentId, transfer.id, 'owner-1');
    expect(approved.status).toBe('approved');

    const shipped = await service.ship(parentId, transfer.id, 'owner-1');
    expect(shipped.status).toBe('shipped');

    const sourceAfterShip = await prisma.product.findUniqueOrThrow({
      where: { id: sourceProductId },
    });
    expect(sourceAfterShip.stockQty).toBe(12); // 20 - 8

    const outMovements = await prisma.stockMovement.findMany({
      where: { businessId: parentId, kind: 'transfer_out' },
    });
    expect(outMovements).toHaveLength(1);
    expect(outMovements[0].qty).toBe(-8);

    // Only the destination branch may receive.
    await expect(
      service.receive(parentId, transfer.id, 'owner-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const received = await service.receive(
      branchId,
      transfer.id,
      'branch-user-1',
    );
    expect(received.status).toBe('received');

    const destAfterReceive = await prisma.product.findUniqueOrThrow({
      where: { id: destProductId },
    });
    expect(destAfterReceive.stockQty).toBe(13); // 5 + 8

    const inMovements = await prisma.stockMovement.findMany({
      where: { businessId: branchId, kind: 'transfer_in' },
    });
    expect(inMovements).toHaveLength(1);
    expect(inMovements[0].qty).toBe(8);

    // Visible to both sides, not to an unrelated business.
    const fromSource = await service.findOne(parentId, transfer.id);
    const fromDest = await service.findOne(branchId, transfer.id);
    expect(fromSource.id).toBe(transfer.id);
    expect(fromDest.id).toBe(transfer.id);
    await expect(
      service.findOne(unrelatedId, transfer.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects approving when the destination branch has no matching-SKU product', async () => {
    const transfer = await service.create(parentId, 'owner-1', {
      destBusinessId: branchId,
      items: [{ productId: sourceNoMatchProductId, qty: 1 }],
    });
    await expect(
      service.approve(parentId, transfer.id, 'owner-1'),
    ).rejects.toBeInstanceOf(AppException);

    await service.reject(
      parentId,
      transfer.id,
      'owner-1',
      'no destination match',
    );
  });

  it('rejects shipping more than the real available source stock', async () => {
    const transfer = await service.create(parentId, 'owner-1', {
      destBusinessId: branchId,
      items: [{ productId: sourceProductId, qty: 999 }],
    });
    await service.approve(parentId, transfer.id, 'owner-1');
    await expect(
      service.ship(parentId, transfer.id, 'owner-1'),
    ).rejects.toBeInstanceOf(AppException);

    await service.reject(parentId, transfer.id, 'owner-1');
  });

  it('rejects performing a step out of order', async () => {
    const transfer = await service.create(parentId, 'owner-1', {
      destBusinessId: branchId,
      items: [{ productId: sourceProductId, qty: 1 }],
    });
    // Still pending — shipping before approval must fail.
    await expect(
      service.ship(parentId, transfer.id, 'owner-1'),
    ).rejects.toBeInstanceOf(AppException);
    // Still pending — receiving before it's even shipped must fail.
    await expect(
      service.receive(branchId, transfer.id, 'branch-user-1'),
    ).rejects.toBeInstanceOf(AppException);

    await service.reject(parentId, transfer.id, 'owner-1');
  });

  it('rejects rejecting a transfer that has already shipped', async () => {
    const transfer = await service.create(parentId, 'owner-1', {
      destBusinessId: branchId,
      items: [{ productId: sourceProductId, qty: 1 }],
    });
    await service.approve(parentId, transfer.id, 'owner-1');
    await service.ship(parentId, transfer.id, 'owner-1');

    await expect(
      service.reject(parentId, transfer.id, 'owner-1'),
    ).rejects.toBeInstanceOf(AppException);

    // Clean up by finishing the lifecycle rather than leaving it stuck mid-flight.
    await service.receive(branchId, transfer.id, 'branch-user-1');
  });
});
