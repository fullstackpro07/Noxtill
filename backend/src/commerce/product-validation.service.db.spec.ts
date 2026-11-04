import { ClsService } from 'nestjs-cls';
import {
  ProductOpportunityRisk,
  ProductOpportunityStatus,
  ProductValidationDecision,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductValidationService } from './product-validation.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { Queue } from 'bullmq';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ProductValidationService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: ProductValidationService;
  let businessId: string;
  let opportunityId: string;
  const specialistAgentEvents = { add: jest.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ProductValidationService(
      tenantPrisma,
      new ActivityService(
        tenantPrisma,
        { publish: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityPubSubService,
      ),
      specialistAgentEvents as unknown as Queue,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Product Validation Test Biz',
        slug: `product-validation-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(async () => {
    specialistAgentEvents.add.mockClear();
    const opportunity = await prisma.productOpportunity.create({
      data: {
        businessId,
        title: 'Validation fixture',
        source: 'Manual research',
        status: ProductOpportunityStatus.validation_requested,
        risk: ProductOpportunityRisk.medium,
        observedPrice: 40,
        estimatedLandedCost: 20,
        demandSignal: 70,
      },
    });
    opportunityId = opportunity.id;
  });

  afterEach(async () => {
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.productValidationRun.deleteMany({
      where: { businessId, opportunityId },
    });
    await prisma.productOpportunityAudit.deleteMany({
      where: { businessId, opportunityId },
    });
    await prisma.productOpportunity.deleteMany({
      where: { businessId, id: opportunityId },
    });
    await prisma.product.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.productValidationRun.deleteMany({ where: { businessId } });
    await prisma.productOpportunityAudit.deleteMany({ where: { businessId } });
    await prisma.productOpportunity.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('persists an evidence snapshot, decision, status transition, and audit row atomically', async () => {
    const result = await service.decide(
      businessId,
      'operator_1',
      opportunityId,
      {
        decision: ProductValidationDecision.approve_test,
        reason: 'Run a limited test based on recorded demand and cost',
        expectedVersion: 1,
      },
    );

    expect(result.opportunity.status).toBe(
      ProductOpportunityStatus.test_approved,
    );
    expect(result.decision.evidenceSnapshot).toMatchObject({
      evidenceCoverage: { recorded: 3, total: 9 },
      opportunity: { source: 'Manual research', version: 1 },
    });
    expect(
      await prisma.productOpportunityAudit.findFirstOrThrow({
        where: { businessId, opportunityId, action: 'validation_approve_test' },
      }),
    ).toMatchObject({ actorUserId: 'operator_1' });
    expect(await service.history(businessId, opportunityId)).toHaveLength(1);
  });

  it('queues a Commerce review only for a persisted validation event and explicit opt-in', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.commerceEnabled': true,
          'agents.commerceValidationEventReviewEnabled': true,
          'commerce.autonomyLevel': 1,
        },
      },
    });

    await service.decide(businessId, 'operator_1', opportunityId, {
      decision: ProductValidationDecision.approve_test,
      reason: 'Verify the review event handoff',
      expectedVersion: 1,
    });

    const activityEvent = await prisma.activityEvent.findFirstOrThrow({
      where: {
        businessId,
        type: 'commerce_validation',
        entityType: 'ProductValidationRun',
      },
    });
    expect(specialistAgentEvents.add).toHaveBeenCalledWith(
      'commerce-validation',
      { businessId, activityEventId: activityEvent.id },
      expect.objectContaining({
        jobId: `commerce-validation-${businessId}-${activityEvent.id}`,
      }),
    );
  });

  it('groups recorded inputs by validation dimension without inventing scores', async () => {
    const candidate = await service.getOne(businessId, opportunityId);

    expect(candidate.evidenceReview.scorecard.status).toBe(
      'evidence_only_not_scored',
    );
    expect(candidate.evidenceReview.scorecard.interpretation).toContain(
      'calculates no dimension score',
    );
    expect(candidate.evidenceReview.scorecard.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'demand_and_competition',
          status: 'partial_evidence',
          recordedFields: ['demand_signal'],
          missingFields: ['trend_velocity', 'competition_score'],
        }),
        expect.objectContaining({
          key: 'economics',
          status: 'partial_evidence',
          recordedFields: ['observed_price', 'estimated_landed_cost'],
          missingFields: ['margin_estimate', 'shipping_estimate'],
        }),
        expect.objectContaining({ key: 'supply', status: 'not_tracked' }),
        expect.objectContaining({ key: 'compliance', status: 'not_tracked' }),
        expect.objectContaining({ key: 'return_risk', status: 'not_tracked' }),
      ]),
    );
  });

  it('refuses to approve launch for a high-risk candidate', async () => {
    await prisma.productOpportunity.update({
      where: { id: opportunityId },
      data: { risk: ProductOpportunityRisk.high },
    });

    await expect(
      service.decide(businessId, 'operator_1', opportunityId, {
        decision: ProductValidationDecision.approve_launch,
        reason: 'High-risk launch without an approval policy',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_VALIDATION_LAUNCH_BLOCKED' },
    });
    expect(await service.history(businessId, opportunityId)).toHaveLength(0);
  });

  it('creates one inactive canonical product from an approved candidate and makes retries idempotent', async () => {
    await service.decide(businessId, 'operator_1', opportunityId, {
      decision: ProductValidationDecision.approve_test,
      reason: 'Run a limited test using confirmed merchant pricing',
      expectedVersion: 1,
    });

    const input = {
      sku: 'VALIDATION-TEST-001',
      costPrice: 12.5,
      sellingPrice: 29.99,
      expectedVersion: 2,
    };
    const first = await service.createCanonicalProduct(
      businessId,
      'operator_1',
      opportunityId,
      input,
    );
    const retry = await service.createCanonicalProduct(
      businessId,
      'operator_1',
      opportunityId,
      input,
    );

    expect(first).toMatchObject({
      alreadyExists: false,
      product: {
        name: 'Validation fixture',
        sku: 'VALIDATION-TEST-001',
        costPrice: 12.5,
        sellingPrice: 29.99,
        stockQty: 0,
        active: false,
      },
    });
    expect(retry).toMatchObject({
      alreadyExists: true,
      product: { id: first.product.id },
    });
    expect(await prisma.product.count({ where: { businessId } })).toBe(1);
    expect(
      await prisma.productOpportunity.findFirstOrThrow({
        where: { id: opportunityId, businessId },
      }),
    ).toMatchObject({ productId: first.product.id, version: 3 });
    expect(
      await prisma.productOpportunityAudit.findFirstOrThrow({
        where: {
          businessId,
          opportunityId,
          action: 'canonical_product_created',
        },
      }),
    ).toMatchObject({ actorUserId: 'operator_1' });
  });

  it('does not create a catalog product before the candidate is approved for test', async () => {
    await expect(
      service.createCanonicalProduct(businessId, 'operator_1', opportunityId, {
        costPrice: 12,
        sellingPrice: 25,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PRODUCT_VALIDATION_PRODUCT_CREATION_NOT_ALLOWED',
      },
    });

    expect(await prisma.product.count({ where: { businessId } })).toBe(0);
  });
});
