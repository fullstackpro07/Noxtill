import {
  ProductOpportunityRisk,
  ProductOpportunityStatus,
  ProductValidationDecision,
} from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ProductValidationService } from './product-validation.service';

const opportunity = {
  id: 'candidate_1',
  businessId: 'business_1',
  title: 'Travel mug',
  source: 'Manual research',
  sourceReference: 'https://example.test/research',
  externalEntityId: null,
  category: 'Drinkware',
  market: 'US',
  observedPrice: 39.95,
  estimatedLandedCost: 18.5,
  demandSignal: 72,
  competitionScore: null,
  trendVelocity: null,
  storeFitScore: null,
  marginEstimate: null,
  supplierCount: 2,
  shippingEstimate: null,
  risk: ProductOpportunityRisk.medium,
  status: ProductOpportunityStatus.validation_requested,
  evidence: 'Manually researched price and demand',
  confidence: 68,
  sourceFreshAt: new Date('2026-09-26T12:00:00.000Z'),
  version: 2,
  createdAt: new Date('2026-09-25T12:00:00.000Z'),
  updatedAt: new Date('2026-09-26T12:00:00.000Z'),
};

function buildService(overrides: Record<string, unknown> = {}) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findFirstInTransaction = jest.fn().mockResolvedValue({
    ...opportunity,
    status: ProductOpportunityStatus.test_approved,
    version: opportunity.version + 1,
  });
  const createRun = jest.fn().mockResolvedValue({
    id: 'validation_1',
    businessId: 'business_1',
    opportunityId: opportunity.id,
    decision: ProductValidationDecision.approve_test,
    reason: 'Evidence is enough for a limited test',
    evidenceSnapshot: {},
    actorUserId: 'user_1',
    createdAt: new Date('2026-09-27T12:00:00.000Z'),
  });
  const createAudit = jest.fn().mockResolvedValue({});
  const tx = {
    productOpportunity: { updateMany, findFirst: findFirstInTransaction },
    productValidationRun: { create: createRun },
    productOpportunityAudit: { create: createAudit },
  };
  const client = {
    productOpportunity: {
      findMany: jest.fn().mockResolvedValue([opportunity]),
      findFirst: jest.fn().mockResolvedValue(opportunity),
    },
    productValidationRun: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  Object.assign(client.productOpportunity, overrides);
  return {
    service: new ProductValidationService(
      {
        client,
      } as unknown as TenantPrismaService,
      activity as unknown as ActivityService,
    ),
    client,
    updateMany,
    createRun,
    createAudit,
    activity,
  };
}

function firstCallArgument(mock: { mock: { calls: unknown[][] } }): unknown {
  return mock.mock.calls[0]?.[0];
}

describe('ProductValidationService', () => {
  it('lists only queued candidates and separates recorded values from unsupported evidence', async () => {
    const { service, client } = buildService();

    const result = await service.list('business_1', 'mug');

    const queryCall = firstCallArgument(client.productOpportunity.findMany);
    expect(queryCall).toMatchObject({
      where: {
        businessId: 'business_1',
        status: ProductOpportunityStatus.validation_requested,
      },
    });
    const typedQueryCall = queryCall as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(typedQueryCall.where.OR).toContainEqual({
      title: { contains: 'mug' },
    });
    expect(result[0].evidenceReview.evidenceCoverage).toEqual({
      recorded: 4,
      total: 9,
    });
    expect(result[0].evidenceReview.launchApproval).toEqual({
      available: false,
      reason:
        'Launch approval is unavailable until compliance evidence and a launch approval policy are configured.',
    });
    expect(result[0].evidenceReview.factors).toContainEqual({
      key: 'competition_score',
      value: null,
      status: 'not_recorded',
    });
    expect(result[0].evidenceReview.unavailableDimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'compliance_readiness',
          status: 'not_available',
        }),
        expect.objectContaining({
          key: 'customer_return_risk',
          status: 'not_available',
        }),
      ]),
    );
  });

  it('returns one tenant-scoped candidate with its current evidence review', async () => {
    const { service, client } = buildService();

    const result = await service.getOne('business_1', opportunity.id);

    expect(client.productOpportunity.findFirst).toHaveBeenCalledWith({
      where: { id: opportunity.id, businessId: 'business_1' },
    });
    expect(result.evidenceReview.evidenceCoverage).toEqual({
      recorded: 4,
      total: 9,
    });
    expect(result.evidenceReview.unavailableDimensions).toHaveLength(3);
  });

  it('atomically records the decision, evidence snapshot, candidate status, and audit entry', async () => {
    const { service, updateMany, createRun, createAudit, activity } =
      buildService();

    const result = await service.decide(
      'business_1',
      'user_1',
      opportunity.id,
      {
        decision: ProductValidationDecision.approve_test,
        reason: '  Evidence is enough for a limited test  ',
        expectedVersion: opportunity.version,
      },
    );

    const updateCall = firstCallArgument(updateMany);
    expect(updateCall).toEqual({
      where: {
        id: opportunity.id,
        businessId: 'business_1',
        status: ProductOpportunityStatus.validation_requested,
        version: opportunity.version,
      },
      data: {
        status: ProductOpportunityStatus.test_approved,
        version: { increment: 1 },
      },
    });
    const runCall = firstCallArgument(createRun);
    expect(runCall).toMatchObject({
      data: {
        businessId: 'business_1',
        opportunityId: opportunity.id,
        decision: ProductValidationDecision.approve_test,
        reason: 'Evidence is enough for a limited test',
        actorUserId: 'user_1',
        evidenceSnapshot: {
          opportunity: {
            source: 'Manual research',
            sourceReference: opportunity.sourceReference,
            version: opportunity.version,
          },
          evidenceCoverage: { recorded: 4, total: 9 },
        },
      },
    });
    const auditCall = firstCallArgument(createAudit);
    expect(auditCall).toMatchObject({
      data: {
        action: 'validation_approve_test',
        actorUserId: 'user_1',
        reason: 'Evidence is enough for a limited test',
      },
    });
    expect(result.sideEffects).toEqual([]);
    expect(result.note).toContain('No Product was created');
    expect(activity.record).toHaveBeenCalledWith(
      'business_1',
      expect.objectContaining({
        type: 'commerce_validation',
        entityType: 'ProductValidationRun',
        entityId: 'validation_1',
        actorUserId: 'user_1',
      }),
    );
  });

  it('blocks a high-risk launch until an approval policy exists', async () => {
    const { service, createRun } = buildService({
      findFirst: jest.fn().mockResolvedValue({
        ...opportunity,
        risk: ProductOpportunityRisk.high,
      }),
    });

    await expect(
      service.decide('business_1', 'user_1', opportunity.id, {
        decision: ProductValidationDecision.approve_launch,
        reason: 'Try to launch',
        expectedVersion: opportunity.version,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_VALIDATION_LAUNCH_BLOCKED' },
    });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('blocks a low or medium-risk launch while compliance evidence is unavailable', async () => {
    const { service, createRun } = buildService();

    await expect(
      service.decide('business_1', 'user_1', opportunity.id, {
        decision: ProductValidationDecision.approve_launch,
        reason: 'The opportunity looks promising',
        expectedVersion: opportunity.version,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PRODUCT_VALIDATION_LAUNCH_BLOCKED',
        message:
          'Launch approval is unavailable until compliance evidence and a launch approval policy are configured.',
      },
    });
    expect(createRun).not.toHaveBeenCalled();
  });

  it('rejects stale or already-reviewed decisions before writing a run', async () => {
    const stale = buildService();
    await expect(
      stale.service.decide('business_1', 'user_1', opportunity.id, {
        decision: ProductValidationDecision.watch,
        reason: 'Wait for stronger evidence',
        expectedVersion: opportunity.version - 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_VALIDATION_VERSION_CONFLICT' },
    });

    const alreadyReviewed = buildService({
      findFirst: jest.fn().mockResolvedValue({
        ...opportunity,
        status: ProductOpportunityStatus.test_approved,
      }),
    });
    await expect(
      alreadyReviewed.service.decide('business_1', 'user_1', opportunity.id, {
        decision: ProductValidationDecision.watch,
        reason: 'Reconsider',
        expectedVersion: opportunity.version,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_VALIDATION_NOT_IN_QUEUE' },
    });
    expect(alreadyReviewed.createRun).not.toHaveBeenCalled();
  });
});
