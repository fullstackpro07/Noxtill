import {
  ProductOpportunityRisk,
  ProductOpportunityStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ProductRadarService } from './product-radar.service';

const baseOpportunity = {
  id: 'opportunity_1',
  title: 'Travel mug',
  source: 'Manual research',
  sourceReference: null,
  externalEntityId: null,
  category: null,
  market: null,
  observedPrice: null,
  estimatedLandedCost: null,
  demandSignal: null,
  competitionScore: null,
  trendVelocity: null,
  storeFitScore: null,
  marginEstimate: null,
  supplierCount: null,
  shippingEstimate: null,
  risk: ProductOpportunityRisk.medium,
  status: ProductOpportunityStatus.discovered,
  evidence: null,
  confidence: null,
  sourceFreshAt: null,
  version: 1,
  createdAt: new Date('2026-09-26T12:00:00.000Z'),
  updatedAt: new Date('2026-09-26T12:00:00.000Z'),
};

describe('ProductRadarService', () => {
  it('creates a research candidate without creating a canonical Product', async () => {
    const create = jest
      .fn<
        Promise<typeof baseOpportunity>,
        [{ data: Record<string, unknown> }]
      >()
      .mockResolvedValue(baseOpportunity);
    const auditCreate = jest
      .fn<Promise<Record<string, never>>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue({});
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          productOpportunity: { create },
          productOpportunityAudit: { create: auditCreate },
        }),
    };
    const service = new ProductRadarService({
      client,
    } as unknown as TenantPrismaService);

    const created = await service.create('business_1', 'user_1', {
      title: '  Travel mug  ',
      source: '  Manual research  ',
    });

    const [[createCall]] = create.mock.calls;
    const [[auditCall]] = auditCreate.mock.calls;
    expect(createCall.data).toMatchObject({
      businessId: 'business_1',
      title: 'Travel mug',
      source: 'Manual research',
    });
    expect(auditCall.data).toMatchObject({
      action: 'created',
      actorUserId: 'user_1',
    });
    expect(auditCall.data.after).toMatchObject({
      title: baseOpportunity.title,
      source: baseOpportunity.source,
      status: ProductOpportunityStatus.discovered,
      version: 1,
    });
    expect(created).toMatchObject({
      id: 'opportunity_1',
      status: ProductOpportunityStatus.discovered,
    });
  });

  it('updates operator-recorded research and writes an audit entry atomically', async () => {
    const updatedOpportunity = {
      ...baseOpportunity,
      observedPrice: 39.95,
      estimatedLandedCost: 18.5,
      demandSignal: 72,
      version: 2,
    };
    const updateMany = jest
      .fn<Promise<{ count: number }>, [{ where: unknown; data: unknown }]>()
      .mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue(updatedOpportunity);
    const auditCreate = jest
      .fn<Promise<Record<string, never>>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue({});
    const client = {
      productOpportunity: {
        findFirst: jest.fn().mockResolvedValue(baseOpportunity),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          productOpportunity: { updateMany, findFirst },
          productOpportunityAudit: { create: auditCreate },
        }),
    };
    const service = new ProductRadarService({
      client,
    } as unknown as TenantPrismaService);

    const result = await service.update(
      'business_1',
      'user_1',
      baseOpportunity.id,
      {
        expectedVersion: 1,
        observedPrice: 39.95,
        estimatedLandedCost: 18.5,
        demandSignal: 72,
        category: null,
        sourceFreshAt: null,
      },
    );

    const updateCall = updateMany.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      where: {
        id: baseOpportunity.id,
        businessId: 'business_1',
        version: 1,
      },
      data: {
        observedPrice: 39.95,
        estimatedLandedCost: 18.5,
        demandSignal: 72,
        category: null,
        sourceFreshAt: null,
        version: { increment: 1 },
      },
    });
    const auditCall = auditCreate.mock.calls[0]?.[0];
    expect(auditCall?.data).toMatchObject({
      businessId: 'business_1',
      opportunityId: baseOpportunity.id,
      action: 'updated',
      actorUserId: 'user_1',
    });
    expect(auditCall?.data.before).toMatchObject({
      observedPrice: null,
      estimatedLandedCost: null,
      demandSignal: null,
      version: 1,
    });
    expect(auditCall?.data.after).toMatchObject({
      observedPrice: 39.95,
      estimatedLandedCost: 18.5,
      demandSignal: 72,
      version: 2,
    });
    expect(result).toMatchObject({
      observedPrice: 39.95,
      estimatedLandedCost: 18.5,
      demandSignal: 72,
      version: 2,
    });
  });

  it('records validation as a request, not a fabricated completed validation', async () => {
    const next = {
      ...baseOpportunity,
      status: ProductOpportunityStatus.validation_requested,
      version: 2,
    };
    const updateMany = jest
      .fn<Promise<{ count: number }>, [{ where: unknown; data: unknown }]>()
      .mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue(next);
    const auditCreate = jest
      .fn<Promise<Record<string, never>>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue({});
    const client = {
      productOpportunity: {
        findFirst: jest.fn().mockResolvedValue(baseOpportunity),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          productOpportunity: { updateMany, findFirst },
          productOpportunityAudit: { create: auditCreate },
        }),
    };
    const service = new ProductRadarService({
      client,
    } as unknown as TenantPrismaService);

    const result = await service.action(
      'business_1',
      'user_1',
      baseOpportunity.id,
      'send_to_validation',
      { expectedVersion: 1 },
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: baseOpportunity.id,
        businessId: 'business_1',
        version: baseOpportunity.version,
      },
      data: {
        status: ProductOpportunityStatus.validation_requested,
        version: { increment: 1 },
      },
    });
    const [[auditCall]] = auditCreate.mock.calls;
    expect(auditCall.data.action).toBe('send_to_validation');
    expect(result.status).toBe(ProductOpportunityStatus.validation_requested);
  });

  it('rejects a concurrent update before writing its audit record', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [{ where: unknown; data: unknown }]>()
      .mockResolvedValue({ count: 0 });
    const auditCreate = jest.fn();
    const client = {
      productOpportunity: {
        findFirst: jest.fn().mockResolvedValue(baseOpportunity),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          productOpportunity: { updateMany, findFirst: jest.fn() },
          productOpportunityAudit: { create: auditCreate },
        }),
    };
    const service = new ProductRadarService({
      client,
    } as unknown as TenantPrismaService);

    await expect(
      service.action('business_1', 'user_1', baseOpportunity.id, 'dismiss', {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PRODUCT_OPPORTUNITY_VERSION_CONFLICT',
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: baseOpportunity.id,
        businessId: 'business_1',
        version: baseOpportunity.version,
      },
      data: {
        status: ProductOpportunityStatus.dismissed,
        version: { increment: 1 },
      },
    });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
