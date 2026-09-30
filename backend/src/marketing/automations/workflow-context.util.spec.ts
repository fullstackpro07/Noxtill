import { WorkflowTriggerKey } from '@prisma/client';
import { buildTriggerContext, ContextReader } from './workflow-context.util';

describe('buildTriggerContext', () => {
  it('provides the scheduled timestamp without reading another business record', async () => {
    const scheduledAt = '2026-09-29T12:00:00.000Z';
    const context = await buildTriggerContext(
      {} as ContextReader,
      'business_1',
      WorkflowTriggerKey.scheduled,
      {
        description: 'Scheduled workflow interval: 60 minutes',
        scheduledAt,
      },
    );

    expect(context).toMatchObject({
      description: 'Scheduled workflow interval: 60 minutes',
      scheduledAt,
    });
  });

  it('loads commerce listing draft details within the triggering business', async () => {
    const draftLookup = jest.fn().mockResolvedValue({
      status: 'review_required',
      channel: 'shopify',
      market: 'US',
      currentVersion: 3,
      product: { id: 'product_1', name: 'Catalog Product' },
    });
    const reader = {
      commerceListingDraft: { findFirst: draftLookup },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_1',
      WorkflowTriggerKey.commerce_listing_draft,
      {
        description: 'Listing draft generated for Catalog Product on shopify',
        entityType: 'CommerceListingDraft',
        entityId: 'draft_1',
      },
    );

    expect(draftLookup).toHaveBeenCalledWith({
      where: { id: 'draft_1', businessId: 'business_1' },
      select: {
        status: true,
        channel: true,
        market: true,
        currentVersion: true,
        product: { select: { id: true, name: true } },
      },
    });
    expect(context).toMatchObject({
      listingDraftId: 'draft_1',
      draftVersion: 3,
      listingStatus: 'review_required',
      listingChannel: 'shopify',
      listingMarket: 'US',
      productId: 'product_1',
      productName: 'Catalog Product',
    });
  });

  it('resolves payment details within the event business', async () => {
    const creditEntryLookup = jest.fn().mockResolvedValue({
      amount: 25,
      customerId: 'customer_1',
      method: 'cash',
    });
    const reader = {
      creditEntry: { findFirst: creditEntryLookup },
      customer: { findFirst: jest.fn().mockResolvedValue({ name: 'Jamie' }) },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_1',
      WorkflowTriggerKey.payment_received,
      {
        description: 'Credit payment from Jamie — 25',
        entityType: 'CreditEntry',
        entityId: 'entry_1',
        amount: 25,
      },
    );

    expect(creditEntryLookup).toHaveBeenCalledWith({
      where: { id: 'entry_1', businessId: 'business_1' },
    });
    expect(context).toMatchObject({
      customerId: 'customer_1',
      paymentAmount: 25,
      paymentMethod: 'cash',
      customerName: 'Jamie',
    });
  });

  it('resolves delivery order context using a tenant-scoped lookup', async () => {
    const deliveryLookup = jest.fn().mockResolvedValue({
      status: 'en_route',
      order: { customerId: 'customer_2', orderNo: 42 },
    });
    const reader = {
      delivery: { findFirst: deliveryLookup },
      customer: { findFirst: jest.fn().mockResolvedValue({ name: 'Riley' }) },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_2',
      WorkflowTriggerKey.delivery_en_route,
      {
        description: 'Order #42 on the way',
        entityType: 'Delivery',
        entityId: 'delivery_2',
      },
    );

    expect(deliveryLookup).toHaveBeenCalledWith({
      where: { id: 'delivery_2', businessId: 'business_2' },
      include: { order: { select: { customerId: true, orderNo: true } } },
    });
    expect(context).toMatchObject({
      deliveryId: 'delivery_2',
      deliveryStatus: 'en_route',
      customerId: 'customer_2',
      customerName: 'Riley',
      orderNo: 42,
    });
  });

  it('resolves commerce-validation decisions and evidence fields within the tenant', async () => {
    const validationLookup = jest.fn().mockResolvedValue({
      decision: 'approve_test',
      evidenceSnapshot: { evidenceCoverage: { recorded: 4, total: 9 } },
      opportunity: {
        title: 'Travel mug',
        risk: 'medium',
        market: 'US',
        confidence: 68,
      },
    });
    const reader = {
      productValidationRun: { findFirst: validationLookup },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_3',
      WorkflowTriggerKey.commerce_validation,
      {
        description: 'Product validation approve test: Travel mug',
        entityType: 'ProductValidationRun',
        entityId: 'validation_3',
      },
    );

    expect(validationLookup).toHaveBeenCalledWith({
      where: { id: 'validation_3', businessId: 'business_3' },
      include: {
        opportunity: {
          select: {
            title: true,
            risk: true,
            market: true,
            confidence: true,
          },
        },
      },
    });
    expect(context).toMatchObject({
      validationDecision: 'approve_test',
      candidateTitle: 'Travel mug',
      candidateRisk: 'medium',
      market: 'US',
      confidence: 68,
      evidenceRecorded: 4,
    });
  });

  it('resolves RFQ state using a tenant-scoped lookup for workflow actions', async () => {
    const rfqLookup = jest.fn().mockResolvedValue({
      status: 'awarded',
      requirement: 'Source insulated mugs',
      market: 'US',
      currency: 'USD',
      purchaseOrderId: 'po_1',
      _count: { suppliers: 3, quotes: 2 },
    });
    const reader = {
      commerceRfq: { findFirst: rfqLookup },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_5',
      WorkflowTriggerKey.commerce_rfq_awarded,
      {
        description: 'Supplier quote awarded',
        entityType: 'CommerceRfq',
        entityId: 'rfq_1',
      },
    );

    expect(rfqLookup).toHaveBeenCalledWith({
      where: { id: 'rfq_1', businessId: 'business_5' },
      select: {
        status: true,
        requirement: true,
        market: true,
        currency: true,
        purchaseOrderId: true,
        _count: { select: { suppliers: true, quotes: true } },
      },
    });
    expect(context).toMatchObject({
      rfqId: 'rfq_1',
      rfqStatus: 'awarded',
      requirement: 'Source insulated mugs',
      market: 'US',
      currency: 'USD',
      supplierCount: 3,
      quoteCount: 2,
      purchaseOrderId: 'po_1',
    });
  });

  it('resolves supplier-claim amounts from tenant-scoped canonical claim records', async () => {
    const claimLookup = jest.fn().mockResolvedValue({
      supplierId: 'supplier_1',
      supplier: { name: 'North Supplier' },
      reference: 'CASE-19',
      reasonCode: 'damaged_goods',
      currency: 'USD',
      status: 'settled',
      items: [
        {
          productLossAmount: '100.00',
          freightLossAmount: '10.00',
          otherLossAmount: '5.00',
        },
      ],
      settlements: [{ amount: '115.00' }],
    });
    const reader = {
      commerceSupplierClaim: { findFirst: claimLookup },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_claims',
      WorkflowTriggerKey.commerce_supplier_claim_settled,
      {
        description: 'Supplier claim fully recovered',
        entityType: 'CommerceSupplierClaim',
        entityId: 'claim_1',
        amount: 100,
      },
    );

    expect(claimLookup).toHaveBeenCalledWith({
      where: { id: 'claim_1', businessId: 'business_claims' },
      include: {
        supplier: { select: { name: true } },
        items: {
          select: {
            productLossAmount: true,
            freightLossAmount: true,
            otherLossAmount: true,
          },
        },
        settlements: { select: { amount: true } },
      },
    });
    expect(context).toMatchObject({
      supplierClaimId: 'claim_1',
      supplierId: 'supplier_1',
      supplierName: 'North Supplier',
      claimStatus: 'settled',
      claimCurrency: 'USD',
      claimReference: 'CASE-19',
      claimReasonCode: 'damaged_goods',
      claimRequestedAmount: 115,
      claimRecoveredAmount: 115,
      claimOutstandingAmount: 0,
    });
  });

  it('resolves SEO audit evidence without exposing page query strings', async () => {
    const auditLookup = jest.fn().mockResolvedValue({
      siteUrl: 'https://shop.example.test/',
      pagesCrawled: 8,
      issuesFound: 6,
      issues: [
        {
          type: 'missing_title',
          severity: 'critical',
          url: 'https://shop.example.test/item?token=private',
        },
        { type: 'missing_meta_description', severity: 'high' },
        { type: 'missing_alt_text', severity: 'low' },
      ],
    });
    const reader = {
      seoAuditRun: { findFirst: auditLookup },
    } as unknown as ContextReader;

    const context = await buildTriggerContext(
      reader,
      'business_4',
      WorkflowTriggerKey.seo_issue_detected,
      {
        description: 'SEO audit found 2 high-priority issues.',
        entityType: 'SeoAuditRun',
        entityId: 'audit_4',
      },
    );

    expect(auditLookup).toHaveBeenCalledWith({
      where: { id: 'audit_4', businessId: 'business_4' },
    });
    expect(context).toMatchObject({
      auditRunId: 'audit_4',
      siteHost: 'shop.example.test',
      pagesCrawled: 8,
      issuesFound: 6,
      highPriorityIssueCount: 2,
      criticalIssueCount: 1,
      topIssueType: 'missing_title',
    });
    expect(JSON.stringify(context)).not.toContain('private');
  });
});
