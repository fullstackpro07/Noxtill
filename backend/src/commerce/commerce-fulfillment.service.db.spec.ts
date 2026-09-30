import { ClsService } from 'nestjs-cls';
import {
  CommerceFulfillmentMappingRole,
  CommerceFulfillmentNodeStatus,
  CommerceFulfillmentNodeType,
  ProductKind,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceFulfillmentService } from './commerce-fulfillment.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceFulfillmentService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceFulfillmentService;
  let businessId: string;
  let branchId: string;
  let foreignBusinessId: string;
  let supplierId: string;
  let foreignSupplierId: string;
  let productA: string;
  let productB: string;
  let serviceProductId: string;
  const stamp = Date.now();
  const skuA = `ful-a-${stamp}`;
  const skuB = `ful-b-${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceFulfillmentService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      prisma,
    );

    businessId = (
      await prisma.business.create({
        data: { name: 'Fulfillment Root', slug: `ful-root-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    branchId = (
      await prisma.business.create({
        data: {
          name: 'Fulfillment Branch',
          slug: `ful-branch-${stamp}`,
          parentId: businessId,
        },
      })
    ).id;
    foreignBusinessId = (
      await prisma.business.create({
        data: { name: 'Fulfillment Foreign', slug: `ful-foreign-${stamp}` },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Dropship Co' },
      })
    ).id;
    foreignSupplierId = (
      await prisma.supplier.create({
        data: { businessId: foreignBusinessId, name: 'Foreign Supplier' },
      })
    ).id;
    productA = (
      await prisma.product.create({
        data: { businessId, name: 'Alpha', sku: skuA, stockQty: 2 },
      })
    ).id;
    productB = (
      await prisma.product.create({
        data: { businessId, name: 'Bravo', sku: skuB, stockQty: 0 },
      })
    ).id;
    serviceProductId = (
      await prisma.product.create({
        data: { businessId, name: 'Haircut', kind: ProductKind.service },
      })
    ).id;
    // The branch holds its own product rows (no shared identity); only SKU A exists there.
    await prisma.product.create({
      data: { businessId: branchId, name: 'Alpha', sku: skuA, stockQty: 17 },
    });
  });

  afterEach(async () => {
    await prisma.commerceFulfillmentAudit.deleteMany({ where: { businessId } });
    await prisma.commerceFulfillmentMapping.deleteMany({
      where: { businessId },
    });
    await prisma.commerceFulfillmentNode.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { businessId: { in: [businessId, branchId] } },
    });
    await prisma.supplier.deleteMany({
      where: { businessId: { in: [businessId, foreignBusinessId] } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.deleteMany({
        where: { id: { in: [branchId, foreignBusinessId, businessId] } },
      });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function ownLocation(name = 'Branch warehouse') {
    return service.createNode(businessId, 'operator', {
      name,
      type: CommerceFulfillmentNodeType.own_location,
      branchBusinessId: branchId,
      serviceMarkets: ['us', 'ca'],
    });
  }

  function dropship(name = 'Dropship node') {
    return service.createNode(businessId, 'operator', {
      name,
      type: CommerceFulfillmentNodeType.dropship_supplier,
      supplierId,
    });
  }

  it('creates an own-location node for a branch in the same group and audits it', async () => {
    const node = await ownLocation();
    expect(node).toMatchObject({
      type: CommerceFulfillmentNodeType.own_location,
      branchBusinessId: branchId,
      serviceMarkets: ['US', 'CA'],
      status: CommerceFulfillmentNodeStatus.active,
    });
    expect(
      await prisma.commerceFulfillmentAudit.count({
        where: { businessId, nodeId: node.id, action: 'node_created' },
      }),
    ).toBe(1);
  });

  it('rejects a branch outside the group, a dropship node without a supplier and a foreign supplier', async () => {
    await expect(
      service.createNode(businessId, 'operator', {
        name: 'Stranger',
        type: CommerceFulfillmentNodeType.own_location,
        branchBusinessId: foreignBusinessId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_BRANCH_NOT_IN_GROUP' },
    });
    await expect(
      service.createNode(businessId, 'operator', {
        name: 'No supplier',
        type: CommerceFulfillmentNodeType.dropship_supplier,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_INVALID_NODE' },
    });
    await expect(
      service.createNode(businessId, 'operator', {
        name: 'Foreign supplier',
        type: CommerceFulfillmentNodeType.dropship_supplier,
        supplierId: foreignSupplierId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_SUPPLIER_NOT_FOUND' },
    });
    await dropship('Taken');
    await expect(dropship('Taken')).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_NODE_NAME_TAKEN' },
    });
  });

  it('reads real branch stock by SKU for own locations and leaves external stock untracked', async () => {
    const own = await ownLocation();
    const external = await dropship();
    for (const productId of [productA, productB]) {
      await service.upsertMapping(businessId, 'operator', {
        nodeId: own.id,
        productId,
        role: CommerceFulfillmentMappingRole.primary,
      });
    }
    await service.upsertMapping(businessId, 'operator', {
      nodeId: external.id,
      productId: productA,
      role: CommerceFulfillmentMappingRole.backup,
    });

    const nodes = await service.listNodes(businessId);
    const ownRow = nodes.find((node) => node.id === own.id);
    const externalRow = nodes.find((node) => node.id === external.id);
    expect(ownRow).toMatchObject({
      branch: { id: branchId, name: 'Fulfillment Branch' },
      mappedProducts: 2,
      primaryFor: 2,
      stock: { tracked: true, units: 17, skusMatched: 1, skusMissing: 1 },
    });
    expect(externalRow).toMatchObject({
      supplier: { id: supplierId, name: 'Dropship Co' },
      backupFor: 1,
      stock: { tracked: false, units: null },
    });
  });

  it('keeps one primary per product by demoting the previous primary to backup', async () => {
    const own = await ownLocation();
    const external = await dropship();
    await service.upsertMapping(businessId, 'operator', {
      nodeId: own.id,
      productId: productA,
      role: CommerceFulfillmentMappingRole.primary,
    });
    await service.upsertMapping(businessId, 'operator', {
      nodeId: external.id,
      productId: productA,
      role: CommerceFulfillmentMappingRole.primary,
    });
    const mappings = await prisma.commerceFulfillmentMapping.findMany({
      where: { businessId, productId: productA },
    });
    expect(
      Object.fromEntries(mappings.map((row) => [row.nodeId, row.role])),
    ).toEqual({
      [own.id]: CommerceFulfillmentMappingRole.backup,
      [external.id]: CommerceFulfillmentMappingRole.primary,
    });
  });

  it('reports coverage from active nodes only and ignores services', async () => {
    const own = await ownLocation();
    const external = await dropship();
    await service.upsertMapping(businessId, 'operator', {
      nodeId: own.id,
      productId: productA,
      role: CommerceFulfillmentMappingRole.primary,
    });
    await service.upsertMapping(businessId, 'operator', {
      nodeId: external.id,
      productId: productA,
      role: CommerceFulfillmentMappingRole.backup,
    });

    let result = await service.coverage(businessId);
    const ids = result.products.map((row) => row.productId);
    expect(ids).not.toContain(serviceProductId);
    const byId = () =>
      Object.fromEntries(
        result.products
          .filter(
            (row) => row.productId === productA || row.productId === productB,
          )
          .map((row) => [row.productId, row.coverage]),
      );
    expect(byId()).toEqual({ [productA]: 'covered', [productB]: 'gap' });

    await service.setNodeStatus(
      businessId,
      'operator',
      own.id,
      CommerceFulfillmentNodeStatus.disabled,
      'Warehouse closed for renovation',
    );
    result = await service.coverage(businessId);
    expect(byId()).toEqual({
      [productA]: 'primary_unavailable',
      [productB]: 'gap',
    });

    await expect(
      service.upsertMapping(businessId, 'operator', {
        nodeId: own.id,
        productId: productB,
        role: CommerceFulfillmentMappingRole.primary,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_NODE_DISABLED' },
    });
    expect(
      await prisma.commerceFulfillmentAudit.findFirst({
        where: { businessId, nodeId: own.id, action: 'node_disabled' },
      }),
    ).toMatchObject({ reason: 'Warehouse closed for renovation' });
  });

  it('refuses to map services and removes mappings with an audit entry', async () => {
    const own = await ownLocation();
    await expect(
      service.upsertMapping(businessId, 'operator', {
        nodeId: own.id,
        productId: serviceProductId,
        role: CommerceFulfillmentMappingRole.primary,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_FULFILLMENT_PRODUCT_NOT_FOUND' },
    });
    const mapping = await service.upsertMapping(businessId, 'operator', {
      nodeId: own.id,
      productId: productB,
      role: CommerceFulfillmentMappingRole.backup,
    });
    await service.removeMapping(businessId, 'operator', mapping.id);
    expect(
      await prisma.commerceFulfillmentMapping.count({
        where: { businessId, productId: productB },
      }),
    ).toBe(0);
    expect(
      (await service.audit(businessId, own.id)).map((row) => row.action),
    ).toEqual(
      expect.arrayContaining([
        'node_created',
        'mapping_set',
        'mapping_removed',
      ]),
    );
  });
});
