import { ClsService } from 'nestjs-cls';
import { BiScenarioType } from '@prisma/client';
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
  let widgets: WidgetsService;
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
    widgets = new WidgetsService(tenant, cls as unknown as ClsService);
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
    await prisma.biDiagnosisHypothesis.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
        entity: 'bi_diagnosis_hypothesis',
      },
    });
    await prisma.biScenarioVersion.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.product.deleteMany({
      where: {
        businessId,
        name: { startsWith: 'BI Simulator QA ' },
      },
    });
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
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'bi.confidenceReviewBelow': 70,
          'bi.confidenceHighAtOrAbove': 90,
          'bi.insightImpactAlertThreshold': 40,
          'bi.simulationPriceChangePercent': 5,
          'bi.simulationAdditionalStockUnits': 3,
          'bi.simulationStaffCountChange': 2,
          'bi.simulationMarketingBudgetChange': 125.5,
        },
      },
    });
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
    expect(salesInsight?.impactThresholdStatus).toBe('Impact not quantified');
    const marketingInsight = result.insights.find(
      (insight) => insight.category === 'marketing',
    );
    expect(marketingInsight?.impactThresholdStatus).toBe(
      'Below impact threshold',
    );

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
      confidenceBandStatus: 'Within configured confidence band',
      sourceHref: '/autonomous-commerce/product-radar',
    });
    expect(radar.themeCounts.growth).toBe(3);
    expect(radar.themeCounts.savings).toBe(0);
    expect(radar.themeCounts.unclassified).toBe(1);
    expect(radar.disclosure).toContain('not a forecast');

    const simulator = await service.simulatorContext(businessId);
    expect(simulator.simulationDefaults).toEqual({
      priceChangePercent: 5,
      additionalStockUnits: 3,
      staffCountChange: 2,
      marketingBudgetChange: 125.5,
    });

    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    const cleared = await service.simulatorContext(businessId);
    expect(cleared.simulationDefaults).toEqual({
      priceChangePercent: null,
      additionalStockUnits: null,
      staffCountChange: null,
      marketingBudgetChange: null,
    });
    const unconfiguredRadar = await service.opportunityRadar(businessId);
    expect(unconfiguredRadar.commerceCandidates[0].confidenceBandStatus).toBe(
      'Confidence thresholds not configured',
    );
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

  it('stores immutable what-if versions without changing live business records', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const product = await prisma.product.create({
      data: {
        businessId,
        name: `BI Simulator QA ${Date.now()}`,
        sellingPrice: 25,
        stockQty: 2,
        lowStockThreshold: 5,
      },
    });
    const revenueBefore = await widgets.getWidgetData('revenue_this_month');
    const recordedRevenue = (revenueBefore as { revenue: number }).revenue;
    const orderCountBefore = await prisma.order.count({
      where: { businessId },
    });

    const priceV1 = await service.createSimulatorScenario(
      businessId,
      'integration-user',
      {
        name: 'QA price scenario',
        scenarioType: BiScenarioType.price,
        priceChangePercent: 10,
      },
    );
    expect(priceV1).toMatchObject({ version: 1, scenarioType: 'price' });
    expect(priceV1.baseline).toMatchObject({
      revenueThisMonth: recordedRevenue,
      source: 'Dashboard revenue_this_month widget',
    });
    expect(priceV1.outcome).toMatchObject({
      revenueAtUnchangedVolume: Math.round(recordedRevenue * 1.1 * 100) / 100,
    });

    const priceV2 = await service.createSimulatorScenario(
      businessId,
      'integration-user',
      {
        name: 'QA price scenario',
        scenarioType: BiScenarioType.price,
        priceChangePercent: 20,
        seriesId: priceV1.seriesId,
      },
    );
    expect(priceV2).toMatchObject({
      seriesId: priceV1.seriesId,
      version: 2,
      scenarioType: 'price',
    });

    const stockScenario = await service.createSimulatorScenario(
      businessId,
      'integration-user',
      {
        name: 'QA stock scenario',
        scenarioType: BiScenarioType.stock,
        productId: product.id,
        additionalStockUnits: 4,
      },
    );
    expect(stockScenario.outcome).toMatchObject({
      projectedStockQty: 6,
      atOrAboveReorderThreshold: true,
    });
    const unchangedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(unchangedProduct.stockQty).toBe(2);
    expect(Number(unchangedProduct.sellingPrice)).toBe(25);

    const staffScenario = await service.createSimulatorScenario(
      businessId,
      'integration-user',
      {
        name: 'QA team-size scenario',
        scenarioType: BiScenarioType.staff,
        staffCountChange: 2,
      },
    );
    expect(staffScenario.outcome).toMatchObject({ hypotheticalTeamSize: 2 });

    const marketingScenario = await service.createSimulatorScenario(
      businessId,
      'integration-user',
      {
        name: 'QA marketing scenario',
        scenarioType: BiScenarioType.marketing,
        marketingBudgetChange: 300,
      },
    );
    expect(marketingScenario).toMatchObject({
      calculationStatus: 'assumptions_only',
      outcome: null,
    });
    expect(marketingScenario.calculationNote).toContain('ROI');
    expect(await prisma.order.count({ where: { businessId } })).toBe(
      orderCountBefore,
    );

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
    expect(await otherService.listSimulatorScenarios(otherBusinessId)).toEqual(
      [],
    );
    const foreignSeriesError = await otherService
      .createSimulatorScenario(otherBusinessId, 'other-user', {
        name: 'Foreign series attempt',
        scenarioType: BiScenarioType.price,
        priceChangePercent: 5,
        seriesId: priceV1.seriesId,
      })
      .catch((error: unknown) => error);
    expect(foreignSeriesError).toBeInstanceOf(AppException);
    expect((foreignSeriesError as AppException).getResponse()).toMatchObject({
      code: 'BI_SCENARIO_NOT_FOUND',
    });
  });

  it('investigates canonical insights with audited hypotheses and tenant isolation', async () => {
    const insight = await prisma.aiInsight.create({
      data: {
        businessId,
        category: 'sales',
        observation: 'Recorded sales decreased during the selected period.',
        sourceFigure: 'Revenue widget: 15% lower than the prior period',
        estimatedImpact: 42,
      },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const result = await service.listDiagnoses(businessId);
    const diagnosis = result.rows.find((row) => row.id === insight.id);
    expect(diagnosis).toMatchObject({
      evidenceStrength: 'A source figure is recorded',
      confidence: null,
      causalStatus: 'Correlation only; a cause is not established',
      diagnosisHypotheses: [],
    });
    expect(diagnosis?.sourceFigure).toBe(insight.sourceFigure);

    const hypothesis = await service.createDiagnosisHypothesis(
      businessId,
      'integration-user',
      insight.id,
      'Check whether the sales change coincided with shorter business hours.',
    );
    expect(hypothesis).toMatchObject({
      businessId,
      insightId: insight.id,
      status: 'open',
    });

    const resolved = await service.resolveDiagnosisHypothesis(
      businessId,
      'integration-user',
      hypothesis.id,
      'Compared operating-hour records; relationship not confirmed.',
    );
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolutionNote:
        'Compared operating-hour records; relationship not confirmed.',
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'bi_diagnosis_hypothesis',
          entityId: hypothesis.id,
        },
      }),
    ).toBe(2);

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
    const otherDiagnoses = await otherService.listDiagnoses(otherBusinessId);
    expect(otherDiagnoses.rows.some((row) => row.id === insight.id)).toBe(
      false,
    );
    await expect(
      otherService.createDiagnosisHypothesis(
        otherBusinessId,
        'other-user',
        insight.id,
        'This cross-tenant hypothesis must be rejected.',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BI_DIAGNOSIS_NOT_FOUND' },
    });
    await expect(
      otherService.resolveDiagnosisHypothesis(
        otherBusinessId,
        'other-user',
        hypothesis.id,
        'This cross-tenant resolution must be rejected.',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BI_DIAGNOSIS_HYPOTHESIS_NOT_FOUND' },
    });
  });
});
