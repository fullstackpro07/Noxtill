import { ClsService } from 'nestjs-cls';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetsService } from '../widgets/widgets.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { BusinessIntelligenceService } from './business-intelligence.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown): void {
    this.store[key] = value;
  }
}

describe('BusinessIntelligenceService (MySQL)', () => {
  let prisma: PrismaService;
  let service: BusinessIntelligenceService;
  let businessId: string;
  let otherBusinessId: string;
  let emptyBusinessId: string;
  let cls: FakeClsService;
  let aiAnswer =
    'The recorded source metrics provide the requested business context.';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const [business, other, emptyBusiness] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'BI overview integration',
          slug: `bi-overview-${Date.now()}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'BI overview other tenant',
          slug: `bi-overview-other-${Date.now()}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'BI overview empty source',
          slug: `bi-overview-empty-${Date.now()}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = other.id;
    emptyBusinessId = emptyBusiness.id;

    cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const widgets = new WidgetsService(tenant, cls as unknown as ClsService);
    service = new BusinessIntelligenceService(tenant, widgets, {
      createMessage: () =>
        Promise.resolve({
          content: [{ type: 'text', text: aiAnswer }],
          stopReason: 'end_turn',
          inputTokens: 12,
          outputTokens: 8,
        }),
    } as unknown as AiInfraService);
  });

  afterAll(async () => {
    await prisma.biBrainAnswer.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.aiInsight.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.productOpportunity.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.order.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId, emptyBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('uses existing Dashboard metric definitions and scopes insights to the current business', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, emptyBusinessId);
    const empty = await service.overview(emptyBusinessId);
    expect(empty.insights).toEqual([]);
    expect(
      empty.metrics.find((metric) => metric.key === 'orders_today')?.value,
    ).toEqual({ count: 0 });

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 910001,
        status: 'completed',
        subtotal: 125,
        total: 125,
        createdAt: new Date(),
      },
    });
    await prisma.order.create({
      data: {
        businessId: otherBusinessId,
        orderNo: 910001,
        status: 'completed',
        subtotal: 900,
        total: 900,
        createdAt: new Date(),
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId,
        category: 'sales',
        observation: 'Revenue changed in the recorded comparison.',
        sourceFigure: 'Revenue source evidence from the integration test.',
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId: otherBusinessId,
        category: 'sales',
        observation: 'Other tenant insight.',
        sourceFigure: 'Should not appear.',
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId,
        category: 'marketing',
        observation: 'A recorded marketing signal.',
        sourceFigure: 'Recorded campaign comparison.',
        estimatedImpact: 35,
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId,
        category: 'stock',
        observation: 'A low-stock signal needs review.',
        sourceFigure: '2 products below the recorded stock threshold.',
      },
    });
    await prisma.productOpportunity.create({
      data: {
        businessId,
        title: 'QA radar candidate',
        source: 'QA integration record',
        status: 'discovered',
        confidence: 80,
        sourceFreshAt: new Date(),
        evidence: 'Observed source evidence',
      },
    });
    await prisma.productOpportunity.create({
      data: {
        businessId: otherBusinessId,
        title: 'Other tenant candidate',
        source: 'QA integration record',
        status: 'discovered',
        confidence: 99,
      },
    });

    const result = await service.overview(businessId);
    const todayRevenue = result.metrics.find(
      (metric) => metric.key === 'revenue_today',
    );
    expect(todayRevenue?.value).toMatchObject({ revenue: 125, orders: 1 });
    expect(result.insights).toHaveLength(3);
    const salesInsight = result.insights.find(
      (insight) => insight.category === 'sales',
    );
    expect(salesInsight?.sourceFigure).toContain('Revenue source evidence');
    expect(salesInsight?.nextDecisionHref).toBe('/profit');

    const radar = await service.opportunityRadar(businessId);
    expect(radar.recordedInsights[0]).toMatchObject({
      theme: 'growth',
      sourceRecordedImpact: 35,
      sourceHref: '/marketing',
      rank: 1,
    });
    expect(radar.commerceCandidates).toHaveLength(1);
    expect(radar.commerceCandidates[0]).toMatchObject({
      title: 'QA radar candidate',
      confidence: 80,
      sourceHref: '/autonomous-commerce/product-radar',
    });
    expect(radar.themeCounts.growth).toBe(3);
    expect(radar.themeCounts.savings).toBe(0);
    expect(radar.themeCounts.unclassified).toBe(1);
    expect(radar.disclosure).toContain('not a forecast');
  });

  it('saves grounded answers with real sources and refuses an unsourced number', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const foreignKeys = await prisma.$queryRaw<{ name: string }[]>`
      SELECT CONSTRAINT_NAME AS name
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bi_brain_answers'
        AND COLUMN_NAME = 'business_id'
        AND REFERENCED_TABLE_NAME = 'businesses'
    `;
    expect(foreignKeys.map((row) => row.name)).toContain(
      'bi_brain_answers_business_id_fkey',
    );

    const saved = await service.askBusinessBrain(
      businessId,
      'integration-user',
      'Summarize the available sales records',
    );
    expect(saved.sourceMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'revenue_today' }),
      ]),
    );
    expect(saved.calculation).toContain('No new KPI formula');
    expect(saved.confidenceNote).toContain('Not numerically calibrated');
    expect(await service.listBrainAnswers(businessId)).toHaveLength(1);
    aiAnswer = 'Recorded revenue was 125.00.';
    await expect(
      service.askBusinessBrain(
        businessId,
        'integration-user',
        'Summarize the available sales records',
      ),
    ).resolves.toMatchObject({ answer: 'Recorded revenue was 125.00.' });
    expect(await service.listBrainAnswers(businessId)).toHaveLength(2);
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const otherTenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const otherService = new BusinessIntelligenceService(
      otherTenant,
      new WidgetsService(otherTenant, cls as unknown as ClsService),
      {} as AiInfraService,
    );
    expect(await otherService.listBrainAnswers(otherBusinessId)).toHaveLength(
      0,
    );

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    aiAnswer = 'The recorded total is 987654321.';
    await expect(
      service.askBusinessBrain(
        businessId,
        'integration-user',
        'Summarize the available sales records',
      ),
    ).rejects.toBeInstanceOf(AppException);
    expect(await service.listBrainAnswers(businessId)).toHaveLength(2);
  });
});
