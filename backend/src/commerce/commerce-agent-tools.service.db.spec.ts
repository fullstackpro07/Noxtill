import { ClsService } from 'nestjs-cls';
import { OrderStatus, OrderType, Role, type Prisma } from '@prisma/client';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { PoliciesService } from '../common/policies/policies.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
} from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import {
  COMMERCE_AGENT_TOOLS,
  CommerceAgentToolsService,
} from './commerce-agent-tools.service';
import type { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import { CommerceRfqsService } from './commerce-rfqs.service';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';
import type { CommerceListingBuilderService } from './commerce-listing-builder.service';
import type { CommerceExperimentsService } from './commerce-experiments.service';
import { CommerceExperimentsService as CanonicalCommerceExperimentsService } from './commerce-experiments.service';
import { CommerceB2bService } from './commerce-b2b.service';
import { CommerceProductionService } from './commerce-production.service';
import { CommerceStoreOptimizerService } from './commerce-store-optimizer.service';
import { ProductValidationService } from './product-validation.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceAgentToolsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceAgentToolsService;
  let approvalService: CommerceAgentToolsService;
  let approvalRfqs: CommerceRfqsService;
  let approvalClaims: CommerceSupplierClaimsService;
  let productValidation: ProductValidationService;
  let businessId: string;
  let productId: string;
  let customerId: string;
  let b2bAccountId: string;
  let cls: FakeClsService;
  let tenant: TenantPrismaService;
  let canonicalExperiments: CanonicalCommerceExperimentsService;
  let production: CommerceProductionService;
  const candidates = jest.fn();
  const generateListingDraft = jest.fn();
  const createRfqDraft = jest.fn();
  const getRfqDraft = jest.fn();
  const createExperimentDraft = jest.fn();
  const createClaimDraft = jest.fn();
  const stamp = Date.now();

  const setPolicies = (policies: Prisma.InputJsonObject) =>
    prisma.business.update({ where: { id: businessId }, data: { policies } });
  let idempotencySequence = 0;
  let approvalFixtureSequence = 0;
  let claimFixtureSequence = 0;
  const runTool = (
    runBusinessId: string,
    actorUserId: string,
    key: string,
    input: Record<string, string>,
    idempotencyKey = `commerce-agent-tool-test-${++idempotencySequence}`,
  ) => service.run(runBusinessId, actorUserId, key, input, idempotencyKey);

  const createApprovalQuote = async (actorUserId: string) => {
    const sequence = ++approvalFixtureSequence;
    const supplier = await prisma.supplier.create({
      data: {
        businessId,
        name: `Approval policy supplier ${stamp}-${sequence}`,
        phone: `+1555${String(stamp).slice(-6)}${String(sequence).padStart(2, '0')}`,
      },
    });
    const rfq = await approvalRfqs.create(businessId, actorUserId, {
      requirement: 'Policy-revocation approval regression',
      currency: 'CAD',
      market: 'US',
      destination: 'New York, US',
      terms: 'Manual recorded quote for policy-revocation test',
      items: [{ productId, description: 'Kettle', qty: 2, minimumQty: 1 }],
      supplierIds: [supplier.id],
    });
    let current = await approvalRfqs.open(businessId, actorUserId, rfq.id, {
      expectedVersion: rfq.version,
    });
    current = await approvalRfqs.confirmManualSupplierSend(
      businessId,
      actorUserId,
      rfq.id,
      { expectedVersion: current.version, supplierIds: [supplier.id] },
    );
    const quoted = await approvalRfqs.recordQuote(
      businessId,
      actorUserId,
      rfq.id,
      {
        invitationId: current.suppliers[0].id,
        expectedVersion: current.version,
        currency: 'CAD',
        freight: 0,
        duties: 0,
        items: [
          {
            rfqItemId: current.items[0].id,
            quotedQty: 2,
            minimumQty: 1,
            unitPrice: 5.75,
          },
        ],
      },
    );
    return { rfq, quote: quoted.quotes[0], version: quoted.version };
  };

  const createApprovalClaim = async (actorUserId: string) => {
    const sequence = ++claimFixtureSequence;
    const supplier = await prisma.supplier.create({
      data: {
        businessId,
        name: `Agent claim approval supplier ${stamp}-${sequence}`,
        phone: `+1555${String(stamp).slice(-6)}${String(sequence).padStart(2, '0')}`,
      },
    });
    const reason = `Evidence-backed test claim ${stamp}-${sequence}`;
    const claim = await approvalClaims.create(businessId, actorUserId, {
      supplierId: supplier.id,
      reasonCode: 'damaged_goods',
      reason,
      currency: 'CAD',
      items: [
        {
          productId,
          description: 'Test fixture item with operator-recorded damage',
          quantityAffected: 1,
          productLossAmount: 12.5,
        },
      ],
    });
    await prisma.commerceSupplierClaimEvidence.create({
      data: {
        claimId: claim.id,
        evidenceType: 'invoice',
        fileKey: `${businessId}/commerce-claims/test-fixture-${sequence}.pdf`,
        note: 'Test fixture evidence row; no external file was uploaded.',
        addedByUserId: actorUserId,
      },
    });
    return { claim, reason };
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    canonicalExperiments = new CanonicalCommerceExperimentsService(tenant);
    production = new CommerceProductionService(tenant);
    productValidation = new ProductValidationService(
      tenant,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as ActivityService,
      { add: jest.fn().mockResolvedValue(undefined) } as never,
    );
    service = new CommerceAgentToolsService(
      tenant,
      {
        create: createRfqDraft,
        getOne: getRfqDraft,
      } as unknown as CommerceRfqsService,
      { candidates } as unknown as CommerceFulfillmentRouterService,
      {
        generate: generateListingDraft,
      } as unknown as CommerceListingBuilderService,
      {
        create: createExperimentDraft,
        specialistReview: (reviewBusinessId: string) =>
          canonicalExperiments.specialistReview(reviewBusinessId),
      } as unknown as CommerceExperimentsService,
      { create: createClaimDraft } as unknown as CommerceSupplierClaimsService,
      productValidation,
      new CommerceB2bService(tenant),
      new PoliciesService(
        prisma,
        cls as unknown as ClsService,
        new CapabilitiesService(prisma),
      ),
      new CommerceStoreOptimizerService(tenant),
      production,
    );
    approvalRfqs = new CommerceRfqsService(tenant, {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivityService);
    approvalClaims = new CommerceSupplierClaimsService(
      tenant,
      {
        getSignedDownloadUrl: jest
          .fn()
          .mockResolvedValue('https://example.test/claim-evidence'),
      } as never,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as ActivityService,
    );
    approvalService = new CommerceAgentToolsService(
      tenant,
      approvalRfqs,
      { candidates } as unknown as CommerceFulfillmentRouterService,
      {
        generate: generateListingDraft,
      } as unknown as CommerceListingBuilderService,
      {
        create: createExperimentDraft,
        specialistReview: (reviewBusinessId: string) =>
          canonicalExperiments.specialistReview(reviewBusinessId),
      } as unknown as CommerceExperimentsService,
      approvalClaims,
      productValidation,
      new CommerceB2bService(tenant),
      new PoliciesService(
        prisma,
        cls as unknown as ClsService,
        new CapabilitiesService(prisma),
      ),
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Agent Tools',
          slug: `agent-tools-${stamp}`,
          currency: 'CAD',
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Kettle',
          sellingPrice: 12.5,
          stockQty: 2,
          lowStockThreshold: 5,
        },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Agent Tools Wholesale Customer',
          phone: `+1555${stamp}7`,
        },
      })
    ).id;
    b2bAccountId = (
      await new CommerceB2bService(tenant).createAccount(businessId, 'owner', {
        customerId,
        companyName: 'Agent Tools Wholesale Account',
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.commerceWorkOrderAudit.deleteMany({ where: { businessId } });
    await prisma.commerceWorkOrder.deleteMany({ where: { businessId } });
    await prisma.commerceBom.deleteMany({ where: { businessId } });
    await prisma.commerceAgentToolRun.deleteMany({ where: { businessId } });
    await prisma.commerceChannelListing.deleteMany({ where: { businessId } });
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.commerceRiskCase.deleteMany({ where: { businessId } });
    await prisma.commerceExperimentAudit.deleteMany({ where: { businessId } });
    await prisma.commerceExperiment.deleteMany({ where: { businessId } });
    await prisma.commerceSupplierClaim.deleteMany({ where: { businessId } });
    await prisma.commerceB2bAudit.deleteMany({ where: { businessId } });
    await prisma.commerceB2bAccount.deleteMany({ where: { businessId } });
    const rfqs = await prisma.commerceRfq.findMany({
      where: { businessId },
      select: { id: true, purchaseOrderId: true },
    });
    const rfqIds = rfqs.map((rfq) => rfq.id);
    const purchaseOrderIds = rfqs.flatMap((rfq) =>
      rfq.purchaseOrderId ? [rfq.purchaseOrderId] : [],
    );
    if (rfqIds.length) {
      await prisma.commerceSupplierQuoteItem.deleteMany({
        where: { quote: { rfqId: { in: rfqIds } } },
      });
      await prisma.commerceSupplierQuote.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqAudit.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqSupplier.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqItem.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
    }
    await prisma.commerceRfq.deleteMany({ where: { businessId } });
    if (purchaseOrderIds.length) {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: { in: purchaseOrderIds } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { id: { in: purchaseOrderIds }, businessId },
      });
    }
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.productOpportunity.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults to observe: read tools run and are audited, write tools are refused and audited', async () => {
    const registry = await service.registry(businessId);
    expect(registry.autonomyLevel).toBe(1);
    const tool = (key: string) =>
      registry.tools.find((row) => row.key === key)!;
    expect(tool('get_product').blockedReason).toBeNull();
    expect(tool('create_experiment')).toMatchObject({
      riskClass: 'LOW_RISK_WRITE',
      executable: true,
      minLevel: 2,
      approvalRequired: false,
    });
    expect(tool('publish_listing')).toMatchObject({
      approvalRequired: true,
      minLevel: 4,
    });
    expect(tool('publish_listing').blockedReason).toMatch(/level 4 or higher/);

    const read = await runTool(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(read.run).toMatchObject({
      outcome: 'succeeded',
      riskClass: 'READ_ONLY',
      autonomyLevel: 1,
    });
    expect(read.result).toMatchObject({
      name: 'Kettle',
      stockQty: 2,
      costPriceAvailable: true,
    });

    const low = await runTool(businessId, 'owner', 'get_inventory', {});
    expect(low.result).toMatchObject({
      lowStockCount: 1,
      productsTruncated: false,
      products: [expect.objectContaining({ id: productId, name: 'Kettle' })],
    });

    const write = await runTool(businessId, 'owner', 'create_rfq', {
      productId,
      qty: '2',
      requirement: 'Please quote this product',
    });
    expect(write).toMatchObject({ result: null, run: { outcome: 'refused' } });
    expect(write.run.refusalReason).toMatch(/does not allow low risk write/);
  });

  it('hides cost from agent output when the business policy is on and the actor lacks permission', async () => {
    await setPolicies({ 'catalog.hideCostFromStaff': true });
    cls.set(CLS_KEY_ROLE, Role.staff);

    const hidden = await runTool(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(hidden.result).not.toHaveProperty('costPrice');
    expect(hidden.result).toMatchObject({ costPriceAvailable: false });
    expect(hidden.run.resultSummary).toMatch(/cost price is hidden/i);

    await prisma.customer.update({
      where: { id: customerId },
      data: { creditLimit: 1 },
    });
    const staffQuote = await runTool(businessId, 'staff', 'preview_b2b_quote', {
      accountId: b2bAccountId,
      productId,
      qty: '2',
    });
    expect(staffQuote.result).toMatchObject({
      creditAvailable: false,
      credit: null,
    });
    expect((staffQuote.result as { warnings: string[] }).warnings).not.toEqual(
      expect.arrayContaining([expect.stringContaining('credit limit')]),
    );

    cls.set(CLS_KEY_ROLE, Role.owner);
    const ownerQuote = await runTool(businessId, 'owner', 'preview_b2b_quote', {
      accountId: b2bAccountId,
      productId,
      qty: '2',
    });
    expect(ownerQuote.result).toMatchObject({
      creditAvailable: true,
      credit: { limit: 1 },
    });
    expect((ownerQuote.result as { warnings: string[] }).warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('credit limit')]),
    );
    await prisma.customer.update({
      where: { id: customerId },
      data: { creditLimit: null },
    });
    await setPolicies({});
  });

  it('counts low-stock products exactly and bounds the returned inventory sample', async () => {
    await prisma.product.createMany({
      data: Array.from({ length: 501 }, (_, index) => ({
        businessId,
        name: `Commerce Agent low-stock fixture ${index}`,
        sku: `COMMERCE-AGENT-LOW-${stamp}-${index}`,
        stockQty: 0,
        lowStockThreshold: 1,
      })),
    });

    const inventory = await runTool(businessId, 'owner', 'get_inventory', {});
    expect(inventory.result).toMatchObject({
      lowStockCount: 502,
      productsTruncated: true,
    });
    const productSample = (inventory.result as { products: unknown[] })
      .products;
    expect(productSample).toHaveLength(500);
  });

  it('reads Product Radar and validation through tenant-scoped records without exposing notes', async () => {
    const privateRadarEvidence = `private radar evidence ${stamp}`;
    const privateValidationReason = `private validation reason ${stamp}`;
    const opportunity = await prisma.productOpportunity.create({
      data: {
        businessId,
        title: `Read-only opportunity ${stamp}`,
        source: 'manual',
        sourceReference: `private source reference ${stamp}`,
        evidence: privateRadarEvidence,
        status: 'validation_requested',
        market: 'US',
        demandSignal: 64,
        observedPrice: '22.50',
        estimatedLandedCost: '9.50',
        marginEstimate: '57.78',
      },
    });
    await prisma.productValidationRun.create({
      data: {
        businessId,
        opportunityId: opportunity.id,
        decision: 'watch',
        reason: privateValidationReason,
        evidenceSnapshot: { note: privateValidationReason },
      },
    });

    const radar = await runTool(
      businessId,
      'owner',
      'get_product_opportunity',
      {
        opportunityId: opportunity.id,
      },
    );
    expect(radar.run.outcome).toBe('succeeded');
    expect(radar.result).toMatchObject({
      id: opportunity.id,
      title: `Read-only opportunity ${stamp}`,
      status: 'validation_requested',
      observedPrice: 22.5,
      sourceFreshAt: null,
    });
    expect(JSON.stringify(radar.result)).not.toContain(privateRadarEvidence);
    expect(JSON.stringify(radar.result)).not.toContain(
      'private source reference',
    );

    const validation = await runTool(
      businessId,
      'owner',
      'get_validation_case',
      {
        opportunityId: opportunity.id,
      },
    );
    expect(validation.run.outcome).toBe('succeeded');
    expect(validation.result).toMatchObject({
      opportunity: { id: opportunity.id },
      evidenceReview: {
        evidenceCoverage: { recorded: 4, total: 9 },
        scorecard: { status: 'evidence_only_not_scored' },
      },
      recentDecisions: [{ decision: 'watch' }],
    });
    const validationJson = JSON.stringify(validation.result);
    expect(validationJson).not.toContain(privateRadarEvidence);
    expect(validationJson).not.toContain(privateValidationReason);

    const foreignBusiness = await prisma.business.create({
      data: {
        name: 'Foreign Product Radar',
        slug: `foreign-radar-${stamp}`,
      },
    });
    const foreignOpportunity = await prisma.productOpportunity.create({
      data: {
        businessId: foreignBusiness.id,
        title: `Foreign opportunity ${stamp}`,
        source: 'manual',
      },
    });
    try {
      const hidden = await runTool(
        businessId,
        'owner',
        'get_product_opportunity',
        {
          opportunityId: foreignOpportunity.id,
        },
      );
      expect(hidden.result).toBeNull();
      expect(hidden.run.resultSummary).toBe('Product opportunity not found.');
    } finally {
      await prisma.productOpportunity.delete({
        where: { id: foreignOpportunity.id },
      });
      await prisma.business.delete({ where: { id: foreignBusiness.id } });
    }
  });

  it('reads Experiment Lab results from the canonical bounded review and excludes drafts', async () => {
    const now = new Date();
    const frozenResults = {
      computedAt: now.toISOString(),
      windowDays: 14,
      baseline: {
        from: new Date(now.getTime() - 28 * 86_400_000).toISOString(),
        to: new Date(now.getTime() - 14 * 86_400_000).toISOString(),
        orders: 4,
        units: 6,
        revenue: 120,
        cost: 72,
        grossMarginPct: 40,
        returnedUnits: 0,
        returnRatePct: 0,
      },
      test: {
        from: new Date(now.getTime() - 14 * 86_400_000).toISOString(),
        to: now.toISOString(),
        orders: 5,
        units: 8,
        revenue: 160,
        cost: 96,
        grossMarginPct: 40,
        returnedUnits: 0,
        returnRatePct: 0,
      },
      primary: {
        metric: 'units',
        baselineValue: 6,
        testValue: 8,
        change: 33.33,
        changeUnit: 'pct',
      },
      sufficient: true,
      insufficientReasons: [],
      guardrail: null,
    };
    const decided = await prisma.commerceExperiment.create({
      data: {
        businessId,
        productId,
        name: `Canonical reviewed experiment ${stamp}`,
        type: 'price',
        hypothesis: 'A recorded change may alter units sold.',
        changeDescription: 'Merchant-entered historical change.',
        primaryMetric: 'units',
        status: 'adopted',
        startedAt: new Date(now.getTime() - 14 * 86_400_000),
        stoppedAt: now,
        frozenResults,
      },
    });
    await prisma.commerceExperiment.create({
      data: {
        businessId,
        productId,
        name: `Draft excluded from read review ${stamp}`,
        type: 'price',
        hypothesis: 'Draft hypothesis.',
        changeDescription: 'No change has started.',
        primaryMetric: 'units',
      },
    });

    const response = await runTool(
      businessId,
      'owner',
      'get_experiment_review',
      {},
    );
    expect(response.run).toMatchObject({
      toolKey: 'get_experiment_review',
      outcome: 'succeeded',
      riskClass: 'READ_ONLY',
    });
    expect(response.result).toMatchObject({
      state: 'available',
      source: 'CommerceExperiment',
      reviewedCount: 1,
      experiments: [
        {
          experimentId: decided.id,
          status: 'adopted',
          resultsAvailable: true,
          sufficient: true,
          baselineValue: 6,
          testValue: 8,
          change: 33.33,
          changeUnit: 'pct',
        },
      ],
    });
    expect(
      (response.result as { limitations: string[] }).limitations,
    ).toContain(
      'This observational comparison is not randomized or a causal result, does not control for seasonality and is not labeled statistically significant.',
    );
    expect(JSON.stringify(response.result)).not.toContain(
      `Draft excluded from read review ${stamp}`,
    );
    expect(response.run.resultSummary).toMatch(/observational, not causal/i);
  });

  it('gives the agent a bounded supplier-claim view without notes or signed evidence links', async () => {
    const { claim, reason } = await createApprovalClaim('claim-read-operator');
    const read = await approvalService.run(
      businessId,
      'claim-read-operator',
      'get_supplier_claim',
      { claimId: claim.id },
      `supplier-claim-read-${stamp}`,
    );

    expect(read.run.outcome).toBe('succeeded');
    expect(read.result).toMatchObject({
      id: claim.id,
      status: 'draft',
      requestedAmount: 12.5,
      recoveredAmount: 0,
      outstandingAmount: 12.5,
      itemCount: 1,
      evidenceCount: 1,
      evidenceTypes: [{ type: 'invoice', count: 1 }],
    });
    const serialized = JSON.stringify(read.result);
    expect(serialized).not.toContain(reason);
    expect(serialized).not.toContain('Test fixture evidence row');
    expect(serialized).not.toContain('https://example.test/claim-evidence');
    expect(serialized).not.toContain(
      'Test fixture item with operator-recorded damage',
    );
  });

  it('reads risk and channel records while omitting private evidence and provider details', async () => {
    const privateRiskEvidence = `private risk evidence ${stamp}`;
    const privateResolution = `private risk resolution ${stamp}`;
    const riskCase = await prisma.commerceRiskCase.create({
      data: {
        businessId,
        ruleKey: 'repeat_returns',
        dedupeKey: `repeat_returns:order:${stamp}`,
        entityType: 'order',
        entityId: `order-${stamp}`,
        entityLabel: `private risk label ${stamp}`,
        severity: 'medium',
        status: 'investigating',
        exposureAmount: 31.25,
        signalCount: 3,
        evidence: {
          explanation: privateRiskEvidence,
          note: privateRiskEvidence,
          windowDays: 90,
          threshold: 3,
          returnCount: 3,
          uniqueOrderCount: 2,
          returnIds: [`private-return-id-${stamp}`],
          orderIds: [`private-order-id-${stamp}`],
        },
        resolution: privateResolution,
      },
    });

    const draft = await prisma.commerceListingDraft.create({
      data: {
        businessId,
        productId,
        channel: 'shopify',
        status: 'approved',
        currentVersion: 4,
      },
    });
    const privateProviderError = `private provider error ${stamp}`;
    const listing = await prisma.commerceChannelListing.create({
      data: {
        businessId,
        draftId: draft.id,
        productId,
        provider: 'shopify',
        externalProductId: `private-external-id-${stamp}`,
        syncedVersion: 3,
        sellingPriceAtSync: 25.5,
        status: 'failed',
        lastError: privateProviderError,
      },
    });

    const risk = await runTool(businessId, 'owner', 'get_risk_case', {
      caseId: riskCase.id,
    });
    expect(risk.run.outcome).toBe('succeeded');
    expect(risk.result).toMatchObject({
      id: riskCase.id,
      ruleKey: 'repeat_returns',
      severity: 'medium',
      status: 'investigating',
      recordedExposureAmount: 31.25,
      signalCount: 3,
      evidenceSummary: {
        windowDays: 90,
        threshold: 3,
        returnCount: 3,
        uniqueOrderCount: 2,
      },
    });
    const riskJson = JSON.stringify(risk.result);
    expect(riskJson).not.toContain(privateRiskEvidence);
    expect(riskJson).not.toContain(privateResolution);
    expect(riskJson).not.toContain(`private risk label ${stamp}`);
    expect(riskJson).not.toContain(riskCase.entityId);
    expect(riskJson).not.toContain(`private-return-id-${stamp}`);
    expect(riskJson).not.toContain(`private-order-id-${stamp}`);

    const channel = await runTool(businessId, 'owner', 'get_channel_listing', {
      listingId: listing.id,
    });
    expect(channel.run.outcome).toBe('succeeded');
    expect(channel.result).toMatchObject({
      id: listing.id,
      productName: 'Kettle',
      provider: 'shopify',
      status: 'failed',
      syncedVersion: 3,
      sellingPriceAtSync: 25.5,
      draft: { channel: 'shopify', status: 'approved', currentVersion: 4 },
    });
    const channelJson = JSON.stringify(channel.result);
    expect(channelJson).not.toContain(`private-external-id-${stamp}`);
    expect(channelJson).not.toContain(privateProviderError);
  });

  it('refuses everything at level 0 and non-read tools while paused, and never executes unbuilt writes', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 0 });
    const disabled = await runTool(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(disabled.run.outcome).toBe('refused');

    await setPolicies({
      'commerce.autonomyLevel': 5,
      'commerce.actionsPaused': true,
    });
    expect(
      (await runTool(businessId, 'owner', 'publish_listing', {})).run
        .refusalReason,
    ).toMatch(/paused/);
    expect(
      (await runTool(businessId, 'owner', 'get_product', { productId })).run
        .outcome,
    ).toBe('succeeded');

    await setPolicies({ 'commerce.autonomyLevel': 5 });
    expect(
      (await runTool(businessId, 'owner', 'publish_listing', {})).run
        .refusalReason,
    ).toMatch(/not yet executable/);

    candidates.mockResolvedValueOnce({ orderId: 'o1', recommended: null });
    const route = await runTool(
      businessId,
      'owner',
      'calculate_fulfillment_route',
      {
        orderId: 'o1',
        destinationCountry: 'us',
      },
    );
    expect(candidates).toHaveBeenCalledWith(businessId, 'o1', 'us');
    expect(route.run.outcome).toBe('succeeded');

    await expect(
      runTool(businessId, 'owner', 'get_order', {}),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_REQUIRED' },
    });
    const runs = await service.runs(businessId);
    expect(runs.find((run) => run.toolKey === 'get_order')).toMatchObject({
      outcome: 'failed',
    });
    expect(new Set(runs.map((run) => run.outcome))).toEqual(
      new Set(['succeeded', 'refused', 'failed']),
    );
  });

  it('enforces the business write-tool allow-list and fails closed on an invalid key', async () => {
    await setPolicies({});
    const defaults = await service.registry(businessId);
    expect(defaults.writeToolAllowlistValid).toBe(true);
    expect(
      defaults.tools
        .filter((tool) => tool.riskClass !== 'READ_ONLY')
        .every((tool) => tool.allowedByBusinessAllowlist),
    ).toBe(true);

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.agentAllowedWriteTools': 'create_supplier_claim_draft',
    });

    const registry = await service.registry(businessId);
    expect(registry.writeToolAllowlistValid).toBe(true);
    expect(registry.allowedWriteToolKeys).toEqual([
      'create_supplier_claim_draft',
    ]);
    const rfqTool = registry.tools.find((tool) => tool.key === 'create_rfq');
    expect(rfqTool?.allowedByBusinessAllowlist).toBe(false);
    expect(rfqTool?.blockedReason).toContain('not on the business allow-list');
    expect(
      registry.tools.find((tool) => tool.key === 'get_product'),
    ).toMatchObject({ allowedByBusinessAllowlist: true, blockedReason: null });

    createRfqDraft.mockClear();
    const excluded = await runTool(businessId, 'owner', 'create_rfq', {
      productId,
      qty: '1',
      requirement: 'Excluded tool must not create an RFQ',
    });
    expect(excluded.run).toMatchObject({ outcome: 'refused' });
    expect(excluded.run.refusalReason).toContain(
      'not on the business allow-list',
    );
    expect(createRfqDraft).not.toHaveBeenCalled();

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.agentAllowedWriteTools':
        'create_supplier_claim_draft,not_a_registered_tool',
    });
    const invalidRegistry = await service.registry(businessId);
    expect(invalidRegistry.writeToolAllowlistValid).toBe(false);
    expect(invalidRegistry.invalidWriteToolEntries).toEqual([
      'not_a_registered_tool',
    ]);
    const failClosed = await runTool(businessId, 'owner', 'create_rfq', {
      productId,
      qty: '1',
      requirement: 'Invalid configuration must block writes',
    });
    expect(failClosed.run.outcome).toBe('refused');
    expect(failClosed.run.refusalReason).toMatch(/invalid or unregistered key/);

    const read = await runTool(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(read.run.outcome).toBe('succeeded');
  });

  it('fails closed for executable medium/high-risk tools until human approval is connected', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const publishTool = COMMERCE_AGENT_TOOLS.find(
      (tool) => tool.key === 'publish_listing',
    )!;
    const originalExecutable = publishTool.executable;
    publishTool.executable = true;

    try {
      const registry = await service.registry(businessId);
      const registryTool = registry.tools.find(
        (tool) => tool.key === 'publish_listing',
      )!;
      expect(registryTool).toMatchObject({
        executable: true,
        approvalRequired: true,
      });
      expect(registryTool.blockedReason).toMatch(
        /requires a human approval workflow/,
      );

      const refused = await runTool(businessId, 'owner', 'publish_listing', {
        draftId: 'draft-that-must-not-publish',
        provider: 'shopify',
      });
      expect(refused).toMatchObject({
        result: null,
        run: { outcome: 'refused' },
      });
      expect(refused.run.refusalReason).toMatch(
        /requires a human approval workflow/,
      );
      expect(refused.run.id).toBeTruthy();
    } finally {
      publishTool.executable = originalExecutable;
    }
  });

  it('requires a second person to approve an RFQ award and executes only the canonical draft-PO action', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const supplier = await prisma.supplier.create({
      data: {
        businessId,
        name: `Approval supplier ${stamp}`,
        phone: `+1555${String(stamp).slice(-7)}`,
      },
    });
    const rfq = await approvalRfqs.create(businessId, 'agent-requester', {
      requirement: 'Purchase the canonical product from the recorded quote',
      currency: 'CAD',
      market: 'US',
      destination: 'New York, US',
      terms: 'Manual quote record for approval-path test',
      items: [{ productId, description: 'Kettle', qty: 2, minimumQty: 1 }],
      supplierIds: [supplier.id],
    });
    let current = await approvalRfqs.open(
      businessId,
      'agent-requester',
      rfq.id,
      { expectedVersion: rfq.version },
    );
    current = await approvalRfqs.confirmManualSupplierSend(
      businessId,
      'agent-requester',
      rfq.id,
      { expectedVersion: current.version, supplierIds: [supplier.id] },
    );
    const quoted = await approvalRfqs.recordQuote(
      businessId,
      'agent-requester',
      rfq.id,
      {
        invitationId: current.suppliers[0].id,
        expectedVersion: current.version,
        currency: 'CAD',
        freight: 0,
        duties: 0,
        items: [
          {
            rfqItemId: current.items[0].id,
            quotedQty: 2,
            minimumQty: 1,
            unitPrice: 5.75,
          },
        ],
      },
    );
    const toolInput = {
      rfqId: rfq.id,
      quoteId: quoted.quotes[0].id,
      expectedVersion: String(quoted.version),
      reason: 'Current complete quote matches the recorded product request',
    };
    const requestKey = `agent-award-approval-${stamp}`;
    const request = await approvalService.run(
      businessId,
      'agent-requester',
      'award_rfq_quote',
      toolInput,
      requestKey,
    );

    expect(request).toMatchObject({
      pendingApproval: true,
      result: null,
      run: { outcome: 'pending_approval', canApprove: false },
    });
    expect(
      (await approvalService.runs(businessId, 'finance-reviewer')).find(
        (row) => row.id === request.run.id,
      ),
    ).toMatchObject({ canApprove: true });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(0);
    expect((await approvalRfqs.getOne(businessId, rfq.id)).status).toBe('open');
    await expect(
      approvalService.approveRun(
        businessId,
        'agent-requester',
        request.run.id,
        'I am the requester',
      ),
    ).rejects.toMatchObject({ status: 403 });

    const approved = await approvalService.approveRun(
      businessId,
      'finance-reviewer',
      request.run.id,
      'Reviewed the current quote and approved the draft award',
    );
    expect(approved.run).toMatchObject({
      outcome: 'succeeded',
      canApprove: false,
    });
    expect(approved.result).toMatchObject({
      status: 'awarded',
      awardedQuoteId: quoted.quotes[0].id,
      purchaseOrder: { status: 'draft' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(1);
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(2);

    const replay = await approvalService.run(
      businessId,
      'agent-requester',
      'award_rfq_quote',
      toolInput,
      requestKey,
    );
    expect(replay).toMatchObject({
      replayed: true,
      run: { id: request.run.id, outcome: 'succeeded' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CommerceAgentToolRun',
          entityId: request.run.id,
          action: {
            in: [
              'commerce.agent_tool_approval_requested',
              'commerce.agent_tool_approved',
              'commerce.agent_tool_approval_executed',
            ],
          },
        },
      }),
    ).toBe(3);
  });

  it('requires a second person and current claim evidence before submitting a supplier claim', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const requester = 'agent-claim-requester';
    const { claim, reason } = await createApprovalClaim(requester);
    const request = await approvalService.run(
      businessId,
      requester,
      'submit_supplier_claim',
      {
        claimId: claim.id,
        expectedVersion: String(claim.version),
        reason,
      },
      `agent-claim-approval-${stamp}`,
    );

    expect(request).toMatchObject({
      pendingApproval: true,
      result: null,
      run: { outcome: 'pending_approval', canApprove: false },
    });
    const reviewerRuns = await approvalService.runs(
      businessId,
      'procurement-claim-reviewer',
    );
    const reviewerRun = reviewerRuns.find((row) => row.id === request.run.id);
    expect(reviewerRun).toMatchObject({ canApprove: true });
    expect(
      await prisma.commerceSupplierClaim.findUniqueOrThrow({
        where: { id: claim.id },
      }),
    ).toMatchObject({ status: 'draft', version: claim.version });
    expect(
      await prisma.commerceSupplierClaimCommunication.count({
        where: { claimId: claim.id },
      }),
    ).toBe(0);
    await expect(
      approvalService.approveRun(
        businessId,
        requester,
        request.run.id,
        'The original requester cannot approve this request',
      ),
    ).rejects.toMatchObject({ status: 403 });

    const approver = 'procurement-claim-reviewer';
    const approved = await approvalService.approveRun(
      businessId,
      approver,
      request.run.id,
      'Reviewed the claim evidence and approved submission for follow-up',
    );
    expect(approved).toMatchObject({
      run: { outcome: 'succeeded' },
      result: {
        id: claim.id,
        status: 'submitted',
        version: claim.version + 1,
      },
    });
    expect(approved.run.resultSummary).toMatch(/no supplier was contacted/i);
    expect(
      await prisma.commerceSupplierClaim.findUniqueOrThrow({
        where: { id: claim.id },
      }),
    ).toMatchObject({ status: 'submitted', version: claim.version + 1 });
    expect(
      await prisma.commerceSupplierClaimCommunication.count({
        where: { claimId: claim.id },
      }),
    ).toBe(0);
    expect(
      await prisma.commerceSupplierClaimAudit.findFirst({
        where: { claimId: claim.id, action: 'submitted' },
      }),
    ).toMatchObject({ actorUserId: approver, reason });

    const replay = await approvalService.run(
      businessId,
      requester,
      'submit_supplier_claim',
      {
        claimId: claim.id,
        expectedVersion: String(claim.version),
        reason,
      },
      `agent-claim-approval-${stamp}`,
    );
    expect(replay).toMatchObject({
      replayed: true,
      run: { id: request.run.id, outcome: 'succeeded' },
    });
    expect(
      await prisma.commerceSupplierClaimAudit.count({
        where: { claimId: claim.id, action: 'submitted' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CommerceAgentToolRun',
          entityId: request.run.id,
          action: {
            in: [
              'commerce.agent_tool_approval_requested',
              'commerce.agent_tool_approved',
              'commerce.agent_tool_approval_executed',
            ],
          },
        },
      }),
    ).toBe(3);
  });

  it('refuses supplier-claim approval when its required evidence disappeared', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const { claim, reason } = await createApprovalClaim(
      'agent-claim-evidence-requester',
    );
    const request = await approvalService.run(
      businessId,
      'agent-claim-evidence-requester',
      'submit_supplier_claim',
      {
        claimId: claim.id,
        expectedVersion: String(claim.version),
        reason,
      },
      `agent-claim-evidence-${stamp}`,
    );
    await prisma.commerceSupplierClaimEvidence.deleteMany({
      where: { claimId: claim.id },
    });

    await expect(
      approvalService.approveRun(
        businessId,
        'procurement-evidence-reviewer',
        request.run.id,
        'The recorded evidence was removed before review',
      ),
    ).rejects.toThrow(
      'Add at least one evidence file before submitting this claim.',
    );
    expect(
      await prisma.commerceSupplierClaim.findUniqueOrThrow({
        where: { id: claim.id },
      }),
    ).toMatchObject({ status: 'draft', version: claim.version });
    expect(
      await prisma.commerceAgentToolRun.findUniqueOrThrow({
        where: { id: request.run.id },
      }),
    ).toMatchObject({ outcome: 'failed' });
  });

  it('rechecks the commerce pause policy when an approval is decided', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const purchaseOrdersBefore = await prisma.purchaseOrder.count({
      where: { businessId },
    });
    const actorUserId = 'agent-requester-policy';
    const { rfq, quote, version } = await createApprovalQuote(actorUserId);
    const request = await approvalService.run(
      businessId,
      actorUserId,
      'award_rfq_quote',
      {
        rfqId: rfq.id,
        quoteId: quote.id,
        expectedVersion: String(version),
        reason: 'Current quote is suitable for this purchase request',
      },
      `agent-award-policy-${stamp}`,
    );

    await setPolicies({
      'commerce.autonomyLevel': 5,
      'commerce.actionsPaused': true,
    });
    const decision = await approvalService.approveRun(
      businessId,
      'finance-reviewer-policy',
      request.run.id,
      'Policy pause was enabled before review',
    );

    expect(decision.run).toMatchObject({ outcome: 'refused' });
    expect(decision.run.refusalReason).toMatch(/actions are paused/);
    expect((await approvalRfqs.getOne(businessId, rfq.id)).status).toBe('open');
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(
      purchaseOrdersBefore,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CommerceAgentToolRun',
          entityId: request.run.id,
          action: 'commerce.agent_tool_approval_refused',
        },
      }),
    ).toBe(1);

    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const rejectActor = 'agent-requester-reject';
    const second = await createApprovalQuote(rejectActor);
    const rejectionRequest = await approvalService.run(
      businessId,
      rejectActor,
      'award_rfq_quote',
      {
        rfqId: second.rfq.id,
        quoteId: second.quote.id,
        expectedVersion: String(second.version),
        reason: 'Quote should be checked by procurement before an award',
      },
      `agent-award-reject-${stamp}`,
    );
    const rejected = await approvalService.rejectRun(
      businessId,
      'finance-reviewer-reject',
      rejectionRequest.run.id,
      'Quote terms do not meet current purchasing requirements',
    );
    expect(rejected.run).toMatchObject({ outcome: 'rejected' });
    expect(rejected.run.refusalReason).toMatch(
      /do not meet current purchasing/,
    );
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(
      purchaseOrdersBefore,
    );
    await setPolicies({});
  });

  it('refuses a pending approval when the business removes its tool from the allow-list', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const purchaseOrdersBefore = await prisma.purchaseOrder.count({
      where: { businessId },
    });
    const actorUserId = 'agent-requester-allowlist-revocation';
    const { rfq, quote, version } = await createApprovalQuote(actorUserId);
    const request = await approvalService.run(
      businessId,
      actorUserId,
      'award_rfq_quote',
      {
        rfqId: rfq.id,
        quoteId: quote.id,
        expectedVersion: String(version),
        reason: 'Request approval while this tool is allow-listed',
      },
      `agent-award-allowlist-${stamp}`,
    );
    expect(request.run.outcome).toBe('pending_approval');

    await setPolicies({
      'commerce.autonomyLevel': 5,
      'commerce.agentAllowedWriteTools': 'submit_supplier_claim',
    });
    const decision = await approvalService.approveRun(
      businessId,
      'finance-reviewer-allowlist',
      request.run.id,
      'The write-tool permission was revoked before approval',
    );

    expect(decision.run).toMatchObject({ outcome: 'refused' });
    expect(decision.run.refusalReason).toContain(
      'not on the business allow-list',
    );
    expect((await approvalRfqs.getOne(businessId, rfq.id)).status).toBe('open');
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(
      purchaseOrdersBefore,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CommerceAgentToolRun',
          entityId: request.run.id,
          action: 'commerce.agent_tool_approval_refused',
        },
      }),
    ).toBe(1);
  });

  it('previews a B2B quote from canonical pricing without creating an order', async () => {
    const registry = await service.registry(businessId);
    expect(
      registry.tools.find((tool) => tool.key === 'preview_b2b_quote'),
    ).toMatchObject({ riskClass: 'READ_ONLY', executable: true, minLevel: 1 });

    const response = await service.run(
      businessId,
      'owner',
      'preview_b2b_quote',
      {
        accountId: b2bAccountId,
        productId,
        qty: '2',
      },
    );

    expect(response.run.outcome).toBe('succeeded');
    expect(response.result).toMatchObject({
      accountId: b2bAccountId,
      currency: 'CAD',
      total: 25,
      lines: [{ productId, qty: 2, unitPrice: 12.5, source: 'base_price' }],
      pricingNote: 'Line total excludes tax; this is a preview only.',
    });
    expect(await prisma.order.count({ where: { businessId } })).toBe(0);
  });

  it('exposes only bounded, estimated due B2B reorder facts to the agent', async () => {
    const orderNos = [987_654_300, 987_654_301, 987_654_302];
    const now = new Date();
    try {
      for (const [index, daysAgo] of [50, 40, 30].entries()) {
        await prisma.order.create({
          data: {
            businessId,
            orderNo: orderNos[index],
            customerId,
            orderType: OrderType.counter,
            status: OrderStatus.completed,
            total: 100,
            createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
          },
        });
      }

      const registry = await service.registry(businessId);
      expect(
        registry.tools.find(
          (tool) => tool.key === 'get_b2b_reorder_opportunities',
        ),
      ).toMatchObject({
        riskClass: 'READ_ONLY',
        executable: true,
        minLevel: 1,
        approvalRequired: false,
      });

      const response = await service.run(
        businessId,
        'owner',
        'get_b2b_reorder_opportunities',
        {},
      );
      expect(response.run).toMatchObject({
        toolKey: 'get_b2b_reorder_opportunities',
        outcome: 'succeeded',
        riskClass: 'READ_ONLY',
      });
      expect(response.result).toMatchObject({
        state: 'due_reorders',
        source: 'CommerceB2bAccount + Order',
        activeAccountCount: 1,
        dueCount: 1,
        insufficientHistoryCount: 0,
        reviewedCount: 1,
        hasMore: false,
        accounts: [
          {
            accountId: b2bAccountId,
            companyName: 'Agent Tools Wholesale Account',
            averageGapDays: 10,
            openQuotes: 0,
          },
        ],
      });
      const result = response.result as {
        accounts: Array<Record<string, unknown>>;
        limitations: string[];
      };
      expect(result.accounts[0]).not.toHaveProperty('customer');
      expect(result.accounts[0]).not.toHaveProperty('credit');
      expect(result.accounts[0]).not.toHaveProperty('taxId');
      expect(result.accounts[0]).not.toHaveProperty('notes');
      expect(JSON.stringify(result)).not.toContain(
        'Agent Tools Wholesale Customer',
      );
      expect(result.limitations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/historical cadence estimate/i),
          expect.stringMatching(/no reorder draft, message, quote or order/i),
        ]),
      );
      expect(response.run.resultSummary).toMatch(/not a prediction/i);
    } finally {
      await prisma.order.deleteMany({
        where: { businessId, orderNo: { in: orderNos } },
      });
    }
  });

  it('exposes aggregate Store Optimizer rule counts without product or customer details', async () => {
    const registry = await service.registry(businessId);
    expect(
      registry.tools.find((tool) => tool.key === 'get_store_optimizer_review'),
    ).toMatchObject({
      riskClass: 'READ_ONLY',
      executable: true,
      minLevel: 1,
      approvalRequired: false,
    });

    const response = await runTool(
      businessId,
      'owner',
      'get_store_optimizer_review',
      {},
    );

    expect(response.run).toMatchObject({
      toolKey: 'get_store_optimizer_review',
      outcome: 'succeeded',
      riskClass: 'READ_ONLY',
    });
    expect(response.result).toMatchObject({
      state: 'findings_present',
      source:
        'Product + OrderItem + ReturnItem + ProductWaitlistEntry + CommerceListingDraft',
      findingCount: 1_004,
      byRule: { missing_photo: 502, missing_category: 502 },
      byImpact: { medium: 502, low: 502 },
    });
    expect(JSON.stringify(response.result)).not.toContain('Kettle');
    expect(JSON.stringify(response.result)).not.toContain('Wholesale Customer');
    expect(
      await prisma.commerceStoreOpportunity.count({ where: { businessId } }),
    ).toBe(0);
    expect(await prisma.order.count({ where: { businessId } })).toBe(0);
  });

  it('exposes real Production & Assembly aggregates without names or cost data', async () => {
    const componentName = `Private production component ${stamp}`;
    const component = await prisma.product.create({
      data: {
        businessId,
        name: componentName,
        stockQty: 0,
        costPrice: 17.25,
      },
    });
    const bom = await production.createBom(businessId, 'owner', {
      productId,
      items: [{ componentProductId: component.id, qtyPerUnit: 2 }],
    });
    await production.createWorkOrder(businessId, 'owner', {
      bomId: bom.id,
      qtyPlanned: 4,
      dueDate: '2020-01-01T00:00:00.000Z',
      demandSource: 'Private demand source text',
    });

    const registry = await service.registry(businessId);
    expect(
      registry.tools.find((tool) => tool.key === 'get_production_review'),
    ).toMatchObject({
      riskClass: 'READ_ONLY',
      executable: true,
      minLevel: 1,
      approvalRequired: false,
    });

    const response = await runTool(
      businessId,
      'owner',
      'get_production_review',
      {},
    );

    expect(response.run).toMatchObject({
      toolKey: 'get_production_review',
      outcome: 'succeeded',
      riskClass: 'READ_ONLY',
    });
    expect(response.result).toMatchObject({
      state: 'records_present',
      source: 'CommerceBom + CommerceWorkOrder',
      activeBomCount: 1,
      archivedBomCount: 0,
      workOrders: {
        total: 1,
        byStatus: { planned: { count: 1, plannedUnits: 4 } },
        lateOpenCount: 1,
        inProgressPlannedUnits: 0,
        completedOutputUnits: null,
      },
    });
    const serializedResult = JSON.stringify(response.result);
    expect(serializedResult).not.toContain(componentName);
    expect(serializedResult).not.toContain('Private demand source text');
    expect(serializedResult).not.toContain('17.25');
    expect(serializedResult).not.toContain('costVariance');
  });

  it('rejects invalid quantities and accounts outside the current business', async () => {
    await expect(
      service.run(businessId, 'owner', 'preview_b2b_quote', {
        accountId: b2bAccountId,
        productId,
        qty: '1.5',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });

    await expect(
      service.run(businessId, 'owner', 'preview_b2b_quote', {
        accountId: 'account-from-another-business',
        productId,
        qty: '1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_B2B_ACCOUNT_NOT_FOUND' },
    });
  });

  it('rejects undeclared, non-string and oversized tool inputs with sanitized failure records', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 5 });
    const before = await prisma.commerceAgentToolRun.count({
      where: { businessId },
    });

    await expect(
      service.run(businessId, 'owner', 'get_product', {
        productId,
        unregistered: 'extra field',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    await expect(
      service.run(businessId, 'owner', 'get_product', {
        productId: { id: productId },
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    await expect(
      service.run(businessId, 'owner', 'create_rfq', {
        productId,
        qty: '1',
        requirement: 'x'.repeat(2_001),
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });

    expect(
      await prisma.commerceAgentToolRun.count({ where: { businessId } }),
    ).toBe(before + 3);
    const rejectedRuns = await prisma.commerceAgentToolRun.findMany({
      where: { businessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      select: { outcome: true, input: true },
    });
    expect(rejectedRuns).toHaveLength(3);
    expect(rejectedRuns.every((run) => run.outcome === 'failed')).toBe(true);
    expect(rejectedRuns.map((run) => run.input)).toEqual(
      Array(3).fill({ validation: 'rejected' }),
    );
  });

  it('rejects an unsafe read result and records the tool run as failed', async () => {
    const executeSpy = jest
      .spyOn(
        service as unknown as {
          execute: (...args: unknown[]) => Promise<unknown>;
        },
        'execute',
      )
      .mockResolvedValue({ result: { count: 1n }, summary: 'Unsafe result' });

    try {
      await expect(
        service.run(businessId, 'output-invalid-reader', 'get_product', {
          productId,
        }),
      ).rejects.toMatchObject({
        response: { code: 'COMMERCE_AGENT_TOOL_OUTPUT_INVALID' },
      });

      const run = await prisma.commerceAgentToolRun.findFirst({
        where: {
          businessId,
          actorUserId: 'output-invalid-reader',
          toolKey: 'get_product',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(run?.outcome).toBe('failed');
      expect(run?.resultSummary).toContain(
        'cannot be safely represented as JSON',
      );
    } finally {
      executeSpy.mockRestore();
    }
  });

  it('keeps a confirmed write successful when only its response cannot be serialized', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    createClaimDraft.mockResolvedValueOnce({
      id: 'claim-output-serialization-test',
      status: 'draft',
      amount: 1n,
    });

    const response = await runTool(
      businessId,
      'output-invalid-writer',
      'create_supplier_claim_draft',
      {
        supplierId: 'operator-recorded-supplier',
        reasonCode: 'damaged_goods',
        reason: 'Operator recorded damage for output serialization test',
        itemDescription: 'Recorded damaged item',
        quantityAffected: '1',
        productLossAmount: '1.00',
      },
    );

    expect(response.result).toMatchObject({
      dataOmitted: true,
      resourceType: 'commerce_supplier_claim',
      resourceId: 'claim-output-serialization-test',
    });
    expect(response.run).toMatchObject({
      outcome: 'succeeded',
    });
    const run = await prisma.commerceAgentToolRun.findFirst({
      where: {
        businessId,
        actorUserId: 'output-invalid-writer',
        toolKey: 'create_supplier_claim_draft',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        outcome: true,
        resultResourceType: true,
        resultResourceId: true,
      },
    });
    expect(run).toMatchObject({
      outcome: 'succeeded',
      resultResourceType: 'commerce_supplier_claim',
      resultResourceId: 'claim-output-serialization-test',
    });
  });

  it('returns bounded quote-comparison facts without supplier contacts or free-text notes', async () => {
    const suppliers = await Promise.all(
      Array.from({ length: 22 }, (_, index) =>
        prisma.supplier.create({
          data: {
            businessId,
            name: `Private quote supplier ${index + 1}`,
            phone: `+1555${String(stamp).slice(-6)}${String(index).padStart(2, '0')}`,
            email: `quote-private-${stamp}-${index}@example.test`,
          },
        }),
      ),
    );
    const rfq = await prisma.commerceRfq.create({
      data: {
        businessId,
        currency: 'CAD',
        requirement: 'private requirement must not enter agent tool result',
        destination: 'private destination must not enter agent tool result',
        terms: 'private RFQ terms must not enter agent tool result',
        items: {
          create: {
            productId,
            description:
              'private line description must not enter agent tool result',
            qty: 2,
          },
        },
        suppliers: {
          create: suppliers.map((supplier) => ({ supplierId: supplier.id })),
        },
      },
      include: { items: true },
    });
    const invitations = await prisma.commerceRfqSupplier.findMany({
      where: { rfqId: rfq.id },
      select: { id: true, supplierId: true },
      orderBy: { supplierId: 'asc' },
    });
    await Promise.all(
      invitations.map((invitation, index) =>
        prisma.commerceSupplierQuote.create({
          data: {
            businessId,
            rfqId: rfq.id,
            supplierId: invitation.supplierId,
            invitationId: invitation.id,
            currency: 'CAD',
            paymentTerms: `private payment terms ${index}`,
            notes: `private quote note ${index}`,
            freight: 1.25,
            duties: 0.5,
            leadTimeDays: 5 + index,
            items: {
              create: {
                rfqItemId: rfq.items[0].id,
                quotedQty: 2,
                minimumQty: 1,
                unitPrice: 7.5 + index,
              },
            },
          },
        }),
      ),
    );

    const response = await runTool(businessId, 'owner', 'compare_quotes', {
      rfqId: rfq.id,
    });
    const result = response.result as {
      quoteCount: number;
      quotesTruncated: boolean;
      quotes: Array<{
        supplierId: string;
        itemCount: number;
        items: Array<{ rfqItemId: string; unitPrice: number }>;
      }>;
    };
    const output = JSON.stringify(result);
    expect(response.run.outcome).toBe('succeeded');
    expect(result).toMatchObject({
      id: rfq.id,
      currency: 'CAD',
      requestedItemCount: 1,
      requestedItemsTruncated: false,
      quoteCount: 22,
      quotesTruncated: true,
    });
    expect(result.quotes).toHaveLength(20);
    const firstQuoteLine = result.quotes[0]?.items[0];
    expect(firstQuoteLine?.rfqItemId).toBe(rfq.items[0].id);
    expect(typeof firstQuoteLine?.unitPrice).toBe('number');
    expect(output).not.toContain(suppliers[0].phone);
    expect(output).not.toContain(suppliers[0].email);
    expect(output).not.toContain('private requirement');
    expect(output).not.toContain('private destination');
    expect(output).not.toContain('private RFQ terms');
    expect(output).not.toContain('private payment terms');
    expect(output).not.toContain('private quote note');
    expect(output).not.toContain('line description');
  });

  it('caps order-line output and discloses when the canonical order has more lines', async () => {
    const order = await prisma.order.create({
      data: { businessId, orderNo: 987_654_321, total: 101 },
    });
    await prisma.orderItem.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        orderId: order.id,
        name: `QA bounded order line ${index + 1}`,
        price: 1,
        cost: 0,
        qty: 1,
      })),
    });

    const response = await runTool(businessId, 'owner', 'get_order', {
      orderId: order.id,
    });
    const result = response.result as {
      itemCount: number;
      itemsTruncated: boolean;
      items: Array<{ name: string; qty: number; price: number }>;
    };
    expect(response.run.outcome).toBe('succeeded');
    expect(result).toMatchObject({
      id: order.id,
      itemCount: 101,
      itemsTruncated: true,
    });
    expect(result.items).toHaveLength(100);
    expect(response.run.resultSummary).toContain('showing the first 100');
  });

  it('creates a canonical review-required listing draft at recommend autonomy without publishing it', async () => {
    generateListingDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = {
      id: 'canonical-listing-draft-id',
      status: 'review_required',
      currentVersion: 1,
    };
    generateListingDraft.mockResolvedValueOnce(canonicalDraft);

    const response = await runTool(
      businessId,
      'listing-agent-actor',
      'create_listing_draft',
      { productId, channel: 'shopify' },
    );

    expect(generateListingDraft).toHaveBeenCalledWith(
      businessId,
      'listing-agent-actor',
      { productId, channel: 'shopify' },
      'commerce_agent',
    );
    expect(response.result).toEqual(canonicalDraft);
    expect(response.run.toolKey).toBe('create_listing_draft');
    expect(response.run.outcome).toBe('succeeded');
    expect(response.run.riskClass).toBe('LOW_RISK_WRITE');
    expect(response.run.autonomyLevel).toBe(2);
    expect(response.run.resultSummary).toContain('human review');
    expect(
      (await service.registry(businessId)).tools.find(
        (tool) => tool.key === 'create_listing_draft',
      ),
    ).toMatchObject({ executable: true, minLevel: 2, approvalRequired: false });

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.actionsPaused': true,
    });
    const paused = await runTool(
      businessId,
      'listing-agent-actor',
      'create_listing_draft',
      { productId, channel: 'shopify' },
    );
    expect(paused.run.outcome).toBe('refused');
    expect(paused.run.refusalReason).toMatch(/paused/);
    expect(generateListingDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported listing channels before calling the canonical builder', async () => {
    generateListingDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    await expect(
      runTool(businessId, 'listing-agent-actor', 'create_listing_draft', {
        productId,
        channel: 'invented-marketplace',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    expect(generateListingDraft).not.toHaveBeenCalled();
    expect(
      await prisma.commerceAgentToolRun.findFirst({
        where: {
          businessId,
          toolKey: 'create_listing_draft',
          outcome: 'failed',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ).not.toBeNull();
  });

  it('creates only a canonical unsent RFQ draft at recommend autonomy', async () => {
    createRfqDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = {
      id: 'canonical-rfq-draft-id',
      status: 'draft',
      version: 1,
      suppliers: [],
    };
    createRfqDraft.mockResolvedValueOnce(canonicalDraft);

    const response = await runTool(
      businessId,
      'sourcing-agent-actor',
      'create_rfq',
      {
        productId,
        qty: '12',
        requirement: 'Quote 12 kettles for US distribution',
      },
    );

    expect(createRfqDraft).toHaveBeenCalledWith(
      businessId,
      'sourcing-agent-actor',
      {
        requirement: 'Quote 12 kettles for US distribution',
        currency: 'CAD',
        items: [{ productId, description: 'Kettle', qty: 12 }],
        supplierIds: [],
      },
    );
    expect(response.result).toEqual(canonicalDraft);
    expect(response.run).toMatchObject({
      toolKey: 'create_rfq',
      outcome: 'succeeded',
      riskClass: 'LOW_RISK_WRITE',
      autonomyLevel: 2,
    });
    expect(response.run.resultSummary).toMatch(
      /not open and no suppliers were invited/,
    );
    expect(
      (await service.registry(businessId)).tools.find(
        (tool) => tool.key === 'create_rfq',
      ),
    ).toMatchObject({ executable: true, minLevel: 2, approvalRequired: false });

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.actionsPaused': true,
    });
    const paused = await runTool(
      businessId,
      'sourcing-agent-actor',
      'create_rfq',
      {
        productId,
        qty: '12',
        requirement: 'Quote 12 kettles for US distribution',
      },
    );
    expect(paused.run.outcome).toBe('refused');
    expect(paused.run.refusalReason).toMatch(/paused/);
    expect(createRfqDraft).toHaveBeenCalledTimes(1);
  });

  it('replays the original write result by idempotency key and rejects key reuse for changed input', async () => {
    createRfqDraft.mockReset();
    getRfqDraft.mockReset();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = { id: `rfq-idempotent-${stamp}`, status: 'draft' };
    createRfqDraft.mockResolvedValueOnce(canonicalDraft);
    getRfqDraft.mockResolvedValueOnce(canonicalDraft);
    const key = `rfq-idempotency-${stamp}`;
    const input = {
      productId,
      qty: '3',
      requirement: 'Quote three kettles',
    };

    const created = await runTool(
      businessId,
      'idempotent-actor',
      'create_rfq',
      input,
      key,
    );
    const replayed = await runTool(
      businessId,
      'idempotent-actor',
      'create_rfq',
      input,
      key,
    );

    expect(created.result).toEqual(canonicalDraft);
    expect(replayed).toMatchObject({
      result: canonicalDraft,
      replayed: true,
      run: { id: created.run.id, outcome: 'succeeded' },
    });
    expect(created.run).not.toHaveProperty('idempotencyKeyHash');
    expect(created.run).not.toHaveProperty('idempotencyRequestHash');
    const listedRun = (await service.runs(businessId)).find(
      (run) => run.id === created.run.id,
    );
    expect(listedRun).not.toHaveProperty('idempotencyKeyHash');
    expect(createRfqDraft).toHaveBeenCalledTimes(1);
    await expect(
      runTool(
        businessId,
        'idempotent-actor',
        'create_rfq',
        { ...input, qty: '4' },
        key,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_IDEMPOTENCY_CONFLICT' },
    });
  });

  it('does not execute a second concurrent write when the first result is still pending', async () => {
    generateListingDraft.mockReset();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = {
      id: `listing-idempotent-${stamp}`,
      status: 'review_required',
      currentVersion: 1,
    };
    let markEntered!: () => void;
    let releaseDraft!: (value: typeof canonicalDraft) => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const pendingDraft = new Promise<typeof canonicalDraft>((resolve) => {
      releaseDraft = resolve;
    });
    generateListingDraft.mockImplementationOnce(() => {
      markEntered();
      return pendingDraft;
    });
    getRfqDraft.mockReset();
    const key = `listing-idempotency-${stamp}`;
    const firstRequest = runTool(
      businessId,
      'idempotent-actor',
      'create_listing_draft',
      { productId, channel: 'shopify' },
      key,
    );
    await entered;
    const replay = await runTool(
      businessId,
      'idempotent-actor',
      'create_listing_draft',
      { productId, channel: 'shopify' },
      key,
    );

    expect(replay).toMatchObject({
      replayed: true,
      pending: true,
      result: null,
    });
    expect(generateListingDraft).toHaveBeenCalledTimes(1);
    releaseDraft(canonicalDraft);
    const completed = await firstRequest;
    expect(completed.run.outcome).toBe('succeeded');
  });

  it('requires an idempotency key before a Commerce write can execute', async () => {
    createRfqDraft.mockReset();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    await expect(
      service.run(businessId, 'missing-key-actor', 'create_rfq', {
        productId,
        qty: '1',
        requirement: 'Quote one kettle',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_IDEMPOTENCY_KEY_REQUIRED' },
    });
    expect(createRfqDraft).not.toHaveBeenCalled();
  });

  it('allows a review-only supplier-claim draft at recommend autonomy and never submits it', async () => {
    createClaimDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = {
      id: 'canonical-claim-draft-id',
      status: 'draft',
      version: 1,
      communications: [],
      evidence: [],
    };
    createClaimDraft.mockResolvedValueOnce(canonicalDraft);

    const input = {
      supplierId: 'supplier-id',
      purchaseOrderId: 'purchase-order-id',
      reasonCode: 'damaged_goods',
      reason: 'Operator recorded damage at receiving inspection',
      productId,
      purchaseOrderItemId: 'purchase-order-item-id',
      itemDescription: 'Damaged units entered by operator',
      quantityAffected: '2',
      productLossAmount: '40.00',
      freightLossAmount: '0',
      otherLossAmount: '0',
    };
    const response = await runTool(
      businessId,
      'claim-agent-actor',
      'create_supplier_claim_draft',
      input,
    );

    expect(createClaimDraft).toHaveBeenCalledWith(
      businessId,
      'claim-agent-actor',
      expect.objectContaining({
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        currency: 'CAD',
        items: [
          expect.objectContaining({
            productId,
            purchaseOrderItemId: input.purchaseOrderItemId,
            quantityAffected: 2,
            productLossAmount: 40,
            freightLossAmount: 0,
            otherLossAmount: 0,
          }),
        ],
      }),
    );
    expect(response.result).toEqual(canonicalDraft);
    expect(response.run).toMatchObject({
      toolKey: 'create_supplier_claim_draft',
      outcome: 'succeeded',
      riskClass: 'LOW_RISK_WRITE',
      autonomyLevel: 2,
    });
    expect(response.run.resultSummary).toContain('no supplier was contacted');
    expect(
      (await service.registry(businessId)).tools.find(
        (tool) => tool.key === 'create_supplier_claim_draft',
      ),
    ).toMatchObject({
      executable: true,
      minLevel: 2,
      approvalRequired: false,
    });

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.actionsPaused': true,
    });
    const paused = await runTool(
      businessId,
      'claim-agent-actor',
      'create_supplier_claim_draft',
      input,
    );
    expect(paused.run.outcome).toBe('refused');
    expect(paused.run.refusalReason).toMatch(/paused/);
    expect(createClaimDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid supplier-claim values before the canonical service is called', async () => {
    createClaimDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    await expect(
      runTool(businessId, 'claim-agent-actor', 'create_supplier_claim_draft', {
        supplierId: 'supplier-id',
        reasonCode: 'damage',
        reason: 'Claim reason entered by the operator',
        itemDescription: 'Damaged item',
        quantityAffected: '1.5',
        productLossAmount: '20.00',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    expect(createClaimDraft).not.toHaveBeenCalled();
    expect(
      await prisma.commerceAgentToolRun.findFirst({
        where: {
          businessId,
          toolKey: 'create_supplier_claim_draft',
          outcome: 'failed',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ).not.toBeNull();
  });

  it('refuses invalid RFQ draft quantity before creating a canonical RFQ', async () => {
    createRfqDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    await expect(
      runTool(businessId, 'sourcing-agent-actor', 'create_rfq', {
        productId,
        qty: '1.5',
        requirement: 'Quote this product',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    expect(createRfqDraft).not.toHaveBeenCalled();
    expect(
      await prisma.commerceAgentToolRun.findFirst({
        where: {
          businessId,
          toolKey: 'create_rfq',
          outcome: 'failed',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ).not.toBeNull();
  });

  it('creates only a canonical experiment draft at recommend autonomy', async () => {
    createExperimentDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    const canonicalDraft = {
      id: 'canonical-experiment-draft-id',
      status: 'draft',
      productId,
    };
    createExperimentDraft.mockResolvedValueOnce(canonicalDraft);

    const response = await runTool(
      businessId,
      'commerce-agent-actor',
      'create_experiment',
      {
        productId,
        name: 'Test a price adjustment',
        type: 'price',
        hypothesis: 'A lower price may change units sold',
        changeDescription: 'Merchant changes the price manually',
        primaryMetric: 'units',
      },
    );

    expect(createExperimentDraft).toHaveBeenCalledWith(
      businessId,
      'commerce-agent-actor',
      {
        productId,
        name: 'Test a price adjustment',
        type: 'price',
        hypothesis: 'A lower price may change units sold',
        changeDescription: 'Merchant changes the price manually',
        primaryMetric: 'units',
      },
    );
    expect(response.result).toEqual(canonicalDraft);
    expect(response.run).toMatchObject({
      toolKey: 'create_experiment',
      outcome: 'succeeded',
      riskClass: 'LOW_RISK_WRITE',
      autonomyLevel: 2,
    });
    expect(response.run.resultSummary).toMatch(
      /product is unchanged and measurement has not started/,
    );

    await setPolicies({
      'commerce.autonomyLevel': 2,
      'commerce.actionsPaused': true,
    });
    const paused = await runTool(
      businessId,
      'commerce-agent-actor',
      'create_experiment',
      {
        productId,
        name: 'Test a price adjustment',
        type: 'price',
        hypothesis: 'A lower price may change units sold',
        changeDescription: 'Merchant changes the price manually',
        primaryMetric: 'units',
      },
    );
    expect(paused.run.outcome).toBe('refused');
    expect(paused.run.refusalReason).toMatch(/paused/);
    expect(createExperimentDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported experiment types before calling the canonical service', async () => {
    createExperimentDraft.mockClear();
    await setPolicies({ 'commerce.autonomyLevel': 2 });
    await expect(
      runTool(businessId, 'commerce-agent-actor', 'create_experiment', {
        productId,
        name: 'Test a price adjustment',
        type: 'invented-experiment',
        hypothesis: 'A lower price may change units sold',
        changeDescription: 'Merchant changes the price manually',
        primaryMetric: 'units',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_INVALID' },
    });
    expect(createExperimentDraft).not.toHaveBeenCalled();
    expect(
      await prisma.commerceAgentToolRun.findFirst({
        where: {
          businessId,
          toolKey: 'create_experiment',
          outcome: 'failed',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ).not.toBeNull();
  });
});
