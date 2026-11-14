import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { CommerceSpecialistAgentService } from './commerce-specialist-agent.service';
import { CommerceAgentEventProcessor } from './commerce-agent-event.processor';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  CommerceExperimentMetric,
  CommerceExperimentStatus,
  CommerceExperimentType,
  IntegrationProvider,
} from '@prisma/client';
import {
  COMMERCE_EXPERIMENT_DECISION_EVENT_JOB,
  COMMERCE_DELIVERY_FAILED_EVENT_JOB,
  COMMERCE_RECONCILIATION_EVENT_JOB,
  COMMERCE_RFQ_QUOTE_EVENT_JOB,
  COMMERCE_VALIDATION_EVENT_JOB,
} from '../common/agents/specialist-agent-events.constants';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }

  run<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }
}

function expectTraceEnvelope(
  options: SpecialistAgentRunOptions,
  expected: {
    eventId: string;
    sourceModule: string;
    entityType: string;
    entityId: string;
  },
) {
  const trace = options.triggerRef;
  if (!trace) throw new Error('Expected a specialist-agent trace envelope');
  expect(trace).toMatchObject(expected);
  expect(Number.isFinite(Date.parse(trace.occurredAt))).toBe(true);
  expect(typeof trace.entityVersion).toBe('string');
  expect(trace.schemaVersion).toBe(1);
  expect(trace.correlationId).toBe(expected.eventId);
}

describe('CommerceAgentEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: CommerceAgentEventProcessor;
  const cls = new FakeClsService();
  const businessIds: string[] = [];
  const productIds: string[] = [];
  const orderIds: string[] = [];
  const deliveryIds: string[] = [];
  const activityEventIds: string[] = [];
  const rfqIds: string[] = [];
  const rfqItemIds: string[] = [];
  const invitationIds: string[] = [];
  const supplierIds: string[] = [];
  const quoteIds: string[] = [];
  const reconciliationRunIds: string[] = [];
  const runAgent = jest.fn<
    Promise<SpecialistAgentRun>,
    [string, null, string, SpecialistAgentRunOptions]
  >();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const businesses = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Commerce Validation Agent Opt In Test',
          slug: `commerce-validation-agent-on-${stamp}`,
          policies: {
            'agents.commerceEnabled': true,
            'agents.commerceValidationEventReviewEnabled': true,
            'agents.commerceDeliveryFailedEventReviewEnabled': true,
            'agents.commerceRfqQuoteEventReviewEnabled': true,
            'agents.commerceExperimentDecisionEventReviewEnabled': true,
            'agents.commerceReconciliationEventReviewEnabled': true,
            'commerce.autonomyLevel': 1,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Commerce Validation Agent Opt Out Test',
          slug: `commerce-validation-agent-off-${stamp}`,
          policies: {
            'agents.commerceEnabled': true,
            'agents.commerceValidationEventReviewEnabled': false,
            'agents.commerceDeliveryFailedEventReviewEnabled': false,
            'agents.commerceRfqQuoteEventReviewEnabled': false,
            'agents.commerceExperimentDecisionEventReviewEnabled': false,
            'agents.commerceReconciliationEventReviewEnabled': false,
            'commerce.autonomyLevel': 1,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Commerce Validation Agent Autonomy Guard Test',
          slug: `commerce-validation-agent-l0-${stamp}`,
          policies: {
            'agents.commerceEnabled': true,
            'agents.commerceValidationEventReviewEnabled': true,
            'agents.commerceDeliveryFailedEventReviewEnabled': true,
            'agents.commerceRfqQuoteEventReviewEnabled': true,
            'agents.commerceExperimentDecisionEventReviewEnabled': true,
            'agents.commerceReconciliationEventReviewEnabled': true,
            'commerce.autonomyLevel': 0,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Commerce Validation Agent Other Tenant Test',
          slug: `commerce-validation-agent-other-${stamp}`,
          policies: {
            'agents.commerceEnabled': true,
            'agents.commerceValidationEventReviewEnabled': true,
            'agents.commerceDeliveryFailedEventReviewEnabled': true,
            'agents.commerceRfqQuoteEventReviewEnabled': true,
            'agents.commerceExperimentDecisionEventReviewEnabled': true,
            'agents.commerceReconciliationEventReviewEnabled': true,
            'commerce.autonomyLevel': 1,
          },
        },
      }),
    ]);
    businessIds.push(...businesses.map((business) => business.id));

    const products = await Promise.all(
      businesses.map((business, index) =>
        prisma.product.create({
          data: {
            businessId: business.id,
            name: `Commerce event fixture ${index + 1} ${stamp}`,
            active: false,
          },
        }),
      ),
    );
    productIds.push(...products.map((product) => product.id));

    const events = await Promise.all(
      products.map((product, index) =>
        prisma.activityEvent.create({
          data: {
            businessId: businesses[index].id,
            type: 'commerce_validation',
            description: 'QA product validation event',
            entityType: 'Product',
            entityId: product.id,
          },
        }),
      ),
    );
    activityEventIds.push(...events.map((event) => event.id));

    const orders = await Promise.all(
      businesses.map((business, index) =>
        prisma.order.create({
          data: { businessId: business.id, orderNo: 90_001 + index },
        }),
      ),
    );
    orderIds.push(...orders.map((order) => order.id));
    const deliveries = await Promise.all(
      orders.map((order, index) =>
        prisma.delivery.create({
          data: {
            businessId: businesses[index].id,
            orderId: order.id,
            addressLine: `Delivery test ${index + 1}`,
            status: 'failed',
            failureReason: 'Customer not available',
          },
        }),
      ),
    );
    deliveryIds.push(...deliveries.map((delivery) => delivery.id));

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: null,
        idempotencyKey: string,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef) throw new Error('Expected Commerce event reference');
        if (actorUserId !== null) {
          throw new Error(
            'Event-triggered reviews must not invent a user actor',
          );
        }
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        expect(options).toMatchObject({
          triggerType: 'event',
          includeAiSummary: false,
        });
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'autonomous_commerce',
            agentVersion: '1.1.0',
            moduleId: '29',
            triggerType: options.triggerType,
            status: 'completed',
            initiatedByUserId: actorUserId,
            idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
            idempotencyRequestHash: specialistAgentIdempotencyHash(
              triggerRef.eventId,
            ),
            inputRefs: [triggerRef],
          },
        });
      },
    );

    processor = new CommerceAgentEventProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: runAgent } as unknown as CommerceSpecialistAgentService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  beforeEach(() => runAgent.mockClear());

  async function createOpenQuote(businessId: string, stamp: string) {
    const supplier = await prisma.supplier.create({
      data: { businessId, name: `Commerce quote-event supplier ${stamp}` },
    });
    supplierIds.push(supplier.id);
    const rfq = await prisma.commerceRfq.create({
      data: {
        businessId,
        requirement: `Quote-event test RFQ ${stamp}`,
        currency: 'USD',
        status: 'open',
        items: { create: [{ description: 'Test line', qty: 1 }] },
      },
      include: { items: true },
    });
    rfqIds.push(rfq.id);
    rfqItemIds.push(rfq.items[0].id);
    const invitation = await prisma.commerceRfqSupplier.create({
      data: {
        rfqId: rfq.id,
        supplierId: supplier.id,
        status: 'responded',
        respondedAt: new Date(),
      },
    });
    invitationIds.push(invitation.id);
    const quote = await prisma.commerceSupplierQuote.create({
      data: {
        businessId,
        rfqId: rfq.id,
        supplierId: supplier.id,
        invitationId: invitation.id,
        currency: 'USD',
        items: {
          create: [{ rfqItemId: rfq.items[0].id, quotedQty: 1, unitPrice: 10 }],
        },
      },
    });
    quoteIds.push(quote.id);
    return quote;
  }

  afterAll(async () => {
    if (businessIds.length > 0) {
      await prisma.specialistAgentRun.deleteMany({
        where: {
          businessId: { in: businessIds },
          agentKey: 'autonomous_commerce',
        },
      });
      await prisma.commerceExperimentAudit.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.commerceExperiment.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.commerceReconciliationRun.deleteMany({
        where: { id: { in: reconciliationRunIds } },
      });
      await prisma.activityEvent.deleteMany({
        where: {
          id: { in: activityEventIds },
          businessId: { in: businessIds },
        },
      });
      await prisma.commerceSupplierQuoteItem.deleteMany({
        where: { quoteId: { in: quoteIds } },
      });
      await prisma.commerceSupplierQuote.deleteMany({
        where: { id: { in: quoteIds }, businessId: { in: businessIds } },
      });
      await prisma.commerceRfqSupplier.deleteMany({
        where: { id: { in: invitationIds } },
      });
      await prisma.commerceRfqItem.deleteMany({
        where: { id: { in: rfqItemIds } },
      });
      await prisma.commerceRfq.deleteMany({
        where: { id: { in: rfqIds }, businessId: { in: businessIds } },
      });
      await prisma.supplier.deleteMany({
        where: { id: { in: supplierIds }, businessId: { in: businessIds } },
      });
      await prisma.delivery.deleteMany({
        where: { id: { in: deliveryIds }, businessId: { in: businessIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: orderIds }, businessId: { in: businessIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: productIds }, businessId: { in: businessIds } },
      });
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    }
    await prisma.$disconnect();
  });

  it('runs one read-only review for an opted-in event and deduplicates redelivery', async () => {
    const businessId = businessIds[0];
    const activityEventId = activityEventIds[0];
    if (!businessId || !activityEventId) {
      throw new Error('Expected an opted-in Commerce validation event fixture');
    }
    const job = {
      name: COMMERCE_VALIDATION_EVENT_JOB,
      data: { businessId, activityEventId },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const validationCall = runAgent.mock.calls[0];
    if (!validationCall) throw new Error('Expected a Commerce validation run');
    const [, , validationIdempotencyKey, validationOptions] = validationCall;
    expect(validationCall.slice(0, 2)).toEqual([businessId, null]);
    expect(validationIdempotencyKey).toBe(
      `commerce-validation:${activityEventId}:${businessId}`,
    );
    expect(validationOptions.triggerType).toBe('event');
    expect(validationOptions.includeAiSummary).toBe(false);
    expectTraceEnvelope(validationOptions, {
      eventId: `commerce-validation:${activityEventId}`,
      sourceModule: 'autonomous_commerce',
      entityType: 'Product',
      entityId: productIds[0],
    });
    const run = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { businessId, agentKey: 'autonomous_commerce' },
    });
    expect(run).toMatchObject({ triggerType: 'event', status: 'completed' });
    expect(run.inputRefs).toEqual([
      expect.objectContaining({
        eventId: `commerce-validation:${activityEventId}`,
      }),
    ]);
  });

  it('reviews only a current supplier quote on an open RFQ and deduplicates retries', async () => {
    const businessId = businessIds[0];
    if (!businessId) throw new Error('Expected an opted-in Commerce business');
    const quote = await createOpenQuote(businessId, `${Date.now()}-active`);
    const job = {
      name: COMMERCE_RFQ_QUOTE_EVENT_JOB,
      data: { businessId, quoteId: quote.id },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const eventId = `commerce-rfq-quote:${quote.id}`;
    const quoteCall = runAgent.mock.calls[0];
    if (!quoteCall) throw new Error('Expected a Commerce quote review');
    const [, , quoteIdempotencyKey, quoteOptions] = quoteCall;
    expect(quoteCall.slice(0, 2)).toEqual([businessId, null]);
    expect(quoteIdempotencyKey).toBe(`${eventId}:${businessId}`);
    expect(quoteOptions.triggerType).toBe('event');
    expect(quoteOptions.includeAiSummary).toBe(false);
    expectTraceEnvelope(quoteOptions, {
      eventId,
      sourceModule: 'commerce_rfq',
      entityType: 'CommerceSupplierQuote',
      entityId: quote.id,
    });
  });

  it('reviews a current recorded experiment decision once and binds the run to its version', async () => {
    const businessId = businessIds[0];
    const productId = productIds[0];
    if (!businessId || !productId) {
      throw new Error('Expected an opted-in Commerce experiment fixture');
    }
    const experiment = await prisma.commerceExperiment.create({
      data: {
        businessId,
        productId,
        name: `Commerce event decision ${Date.now()}`,
        type: CommerceExperimentType.price,
        hypothesis: 'The recorded test change may affect revenue',
        changeDescription: 'Merchant-entered price change',
        primaryMetric: CommerceExperimentMetric.revenue,
        status: CommerceExperimentStatus.adopted,
        decisionNote: 'Observed results reviewed by the merchant',
        decidedAt: new Date(),
      },
    });
    const decisionUpdatedAt = experiment.updatedAt.toISOString();
    const eventId = `commerce-experiment-decision:${experiment.id}:${decisionUpdatedAt}`;
    const job = {
      name: COMMERCE_EXPERIMENT_DECISION_EVENT_JOB,
      data: { businessId, experimentId: experiment.id, decisionUpdatedAt },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected a Commerce experiment review');
    const [, , idempotencyKey, options] = call;
    expect(idempotencyKey).toBe(`${eventId}:${businessId}`);
    expectTraceEnvelope(options, {
      eventId,
      sourceModule: 'autonomous_commerce',
      entityType: 'CommerceExperiment',
      entityId: experiment.id,
    });
    expect(options.triggerRef?.entityVersion).toBe(
      `adopted:${decisionUpdatedAt}`,
    );
  });

  it('does not review opted-out, cross-business or superseded experiment decisions', async () => {
    const optedOutBusinessId = businessIds[1];
    const currentBusinessId = businessIds[0];
    const foreignBusinessId = businessIds[3];
    const productId = productIds[0];
    const foreignProductId = productIds[3];
    if (
      !optedOutBusinessId ||
      !currentBusinessId ||
      !foreignBusinessId ||
      !productId ||
      !foreignProductId
    ) {
      throw new Error('Expected Commerce experiment policy fixtures');
    }
    const createDecision = (businessId: string, targetProductId: string) =>
      prisma.commerceExperiment.create({
        data: {
          businessId,
          productId: targetProductId,
          name: `Commerce event guard ${Date.now()} ${businessId}`,
          type: CommerceExperimentType.price,
          hypothesis: 'Observed result requires human interpretation',
          changeDescription: 'Merchant-entered change',
          primaryMetric: CommerceExperimentMetric.revenue,
          status: CommerceExperimentStatus.inconclusive,
          decisionNote: 'Insufficient evidence',
          decidedAt: new Date(),
        },
      });
    const optedOut = await createDecision(optedOutBusinessId, productIds[1]);
    const foreign = await createDecision(foreignBusinessId, foreignProductId);
    const superseded = await createDecision(currentBusinessId, productId);
    const staleUpdatedAt = superseded.updatedAt.toISOString();
    await prisma.commerceExperiment.update({
      where: { id: superseded.id },
      data: { decisionNote: 'Updated after original decision event' },
    });

    for (const event of [
      {
        businessId: optedOutBusinessId,
        experimentId: optedOut.id,
        decisionUpdatedAt: optedOut.updatedAt.toISOString(),
      },
      {
        businessId: currentBusinessId,
        experimentId: foreign.id,
        decisionUpdatedAt: foreign.updatedAt.toISOString(),
      },
      {
        businessId: currentBusinessId,
        experimentId: superseded.id,
        decisionUpdatedAt: staleUpdatedAt,
      },
    ]) {
      await processor.process({
        name: COMMERCE_EXPERIMENT_DECISION_EVENT_JOB,
        data: event,
      } as Job<unknown>);
    }

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('reviews a completed listing reconciliation once and pins the saved check', async () => {
    const businessId = businessIds[0];
    if (!businessId) throw new Error('Expected an opted-in Commerce business');
    const finishedAt = new Date();
    const reconciliation = await prisma.commerceReconciliationRun.create({
      data: {
        businessId,
        provider: IntegrationProvider.shopify,
        status: 'completed',
        listingsChecked: 5,
        discrepancies: 2,
        actorUserId: 'commerce-reconciliation-agent-test-user',
        finishedAt,
      },
    });
    reconciliationRunIds.push(reconciliation.id);
    const eventId = `commerce-reconciliation:${reconciliation.id}`;
    const job = {
      name: COMMERCE_RECONCILIATION_EVENT_JOB,
      data: {
        businessId,
        reconciliationRunId: reconciliation.id,
        finishedAt: finishedAt.toISOString(),
      },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected a listing reconciliation review');
    const [, , idempotencyKey, options] = call;
    expect(idempotencyKey).toBe(`${eventId}:${businessId}`);
    expectTraceEnvelope(options, {
      eventId,
      sourceModule: 'autonomous_commerce',
      entityType: 'CommerceReconciliationRun',
      entityId: reconciliation.id,
    });
    expect(options.triggerRef?.entityVersion).toBe('shopify:5:2');
  });

  it('skips disabled, foreign, superseded and clean reconciliation checks', async () => {
    const optedOutBusinessId = businessIds[1];
    const businessId = businessIds[0];
    const foreignBusinessId = businessIds[3];
    if (!optedOutBusinessId || !businessId || !foreignBusinessId) {
      throw new Error('Expected Commerce reconciliation policy fixtures');
    }
    const finishedAt = new Date();
    const createRun = (ownerBusinessId: string, discrepancies: number) =>
      prisma.commerceReconciliationRun.create({
        data: {
          businessId: ownerBusinessId,
          provider: IntegrationProvider.shopify,
          status: 'completed',
          listingsChecked: 4,
          discrepancies,
          finishedAt,
        },
      });
    const [optedOut, foreign, stale, clean] = await Promise.all([
      createRun(optedOutBusinessId, 1),
      createRun(foreignBusinessId, 1),
      createRun(businessId, 1),
      createRun(businessId, 0),
    ]);
    reconciliationRunIds.push(optedOut.id, foreign.id, stale.id, clean.id);
    await prisma.commerceReconciliationRun.update({
      where: { id: stale.id },
      data: { finishedAt: new Date(finishedAt.getTime() + 1000) },
    });
    for (const event of [
      {
        businessId: optedOutBusinessId,
        reconciliationRunId: optedOut.id,
        finishedAt: finishedAt.toISOString(),
      },
      {
        businessId,
        reconciliationRunId: foreign.id,
        finishedAt: finishedAt.toISOString(),
      },
      {
        businessId,
        reconciliationRunId: stale.id,
        finishedAt: finishedAt.toISOString(),
      },
      {
        businessId,
        reconciliationRunId: clean.id,
        finishedAt: finishedAt.toISOString(),
      },
    ]) {
      await processor.process({
        name: COMMERCE_RECONCILIATION_EVENT_JOB,
        data: event,
      } as Job<unknown>);
    }
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('skips opted-out, cross-business, superseded and closed-RFQ quote events', async () => {
    const optedOutBusinessId = businessIds[1];
    const disabledBusinessId = businessIds[2];
    const currentBusinessId = businessIds[0];
    const foreignBusinessId = businessIds[3];
    if (
      !optedOutBusinessId ||
      !disabledBusinessId ||
      !currentBusinessId ||
      !foreignBusinessId
    ) {
      throw new Error('Expected Commerce quote event policy fixtures');
    }
    const optedOutQuote = await createOpenQuote(
      optedOutBusinessId,
      'opted-out',
    );
    const disabledQuote = await createOpenQuote(disabledBusinessId, 'disabled');
    const foreignQuote = await createOpenQuote(foreignBusinessId, 'foreign');
    const supersededQuote = await createOpenQuote(
      currentBusinessId,
      'superseded',
    );
    const closedRfqQuote = await createOpenQuote(currentBusinessId, 'closed');
    await prisma.commerceSupplierQuote.update({
      where: { id: supersededQuote.id },
      data: { status: 'superseded' },
    });
    await prisma.commerceRfq.update({
      where: { id: closedRfqQuote.rfqId },
      data: { status: 'closed' },
    });

    for (const event of [
      { businessId: optedOutBusinessId, quoteId: optedOutQuote.id },
      { businessId: disabledBusinessId, quoteId: disabledQuote.id },
      { businessId: currentBusinessId, quoteId: foreignQuote.id },
      { businessId: currentBusinessId, quoteId: supersededQuote.id },
      { businessId: currentBusinessId, quoteId: closedRfqQuote.id },
    ]) {
      await processor.process({
        name: COMMERCE_RFQ_QUOTE_EVENT_JOB,
        data: event,
      } as Job<unknown>);
    }

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('skips opted-out businesses and Commerce autonomy level zero', async () => {
    const optedOutBusinessId = businessIds[1];
    const disabledBusinessId = businessIds[2];
    const optedOutEventId = activityEventIds[1];
    const disabledEventId = activityEventIds[2];
    if (
      !optedOutBusinessId ||
      !disabledBusinessId ||
      !optedOutEventId ||
      !disabledEventId
    ) {
      throw new Error('Expected Commerce policy guard fixtures');
    }

    await processor.process({
      name: COMMERCE_VALIDATION_EVENT_JOB,
      data: {
        businessId: optedOutBusinessId,
        activityEventId: optedOutEventId,
      },
    } as Job<unknown>);
    await processor.process({
      name: COMMERCE_VALIDATION_EVENT_JOB,
      data: {
        businessId: disabledBusinessId,
        activityEventId: disabledEventId,
      },
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('rejects an event id that belongs to another business', async () => {
    const businessId = businessIds[0];
    const otherTenantEventId = activityEventIds[3];
    if (!businessId || !otherTenantEventId) {
      throw new Error('Expected cross-tenant Commerce event fixture');
    }

    await processor.process({
      name: COMMERCE_VALIDATION_EVENT_JOB,
      data: { businessId, activityEventId: otherTenantEventId },
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('runs one read-only review for a current failed delivery and deduplicates redelivery', async () => {
    const businessId = businessIds[0];
    const deliveryId = deliveryIds[0];
    if (!businessId || !deliveryId) {
      throw new Error('Expected an opted-in failed-delivery fixture');
    }
    const delivery = await prisma.delivery.findFirstOrThrow({
      where: { id: deliveryId, businessId, status: 'failed' },
    });
    const job = {
      name: COMMERCE_DELIVERY_FAILED_EVENT_JOB,
      data: {
        businessId,
        deliveryId,
        failedAt: delivery.updatedAt.toISOString(),
      },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const eventId = `delivery-failed:${deliveryId}:${delivery.updatedAt.toISOString()}`;
    const deliveryCall = runAgent.mock.calls[0];
    if (!deliveryCall) throw new Error('Expected a Commerce delivery review');
    const [, , deliveryIdempotencyKey, deliveryOptions] = deliveryCall;
    expect(deliveryCall.slice(0, 2)).toEqual([businessId, null]);
    expect(deliveryIdempotencyKey).toBe(`${eventId}:${businessId}`);
    expect(deliveryOptions.triggerType).toBe('event');
    expect(deliveryOptions.includeAiSummary).toBe(false);
    expectTraceEnvelope(deliveryOptions, {
      eventId,
      sourceModule: 'delivery',
      entityType: 'Delivery',
      entityId: deliveryId,
    });
  });

  it('rechecks delivery status and tenant ownership before processing a queued event', async () => {
    const businessId = businessIds[0];
    const otherBusinessId = businessIds[3];
    const deliveryId = deliveryIds[0];
    if (!businessId || !otherBusinessId || !deliveryId) {
      throw new Error('Expected tenant-scoped delivery fixtures');
    }
    const delivery = await prisma.delivery.findFirstOrThrow({
      where: { id: deliveryId, businessId },
    });

    await processor.process({
      name: COMMERCE_DELIVERY_FAILED_EVENT_JOB,
      data: {
        businessId: otherBusinessId,
        deliveryId,
        failedAt: delivery.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: 'unassigned' },
    });
    await processor.process({
      name: COMMERCE_DELIVERY_FAILED_EVENT_JOB,
      data: {
        businessId,
        deliveryId,
        failedAt: delivery.updatedAt.toISOString(),
      },
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('does not run a failure review when the event policy is off or Commerce autonomy is disabled', async () => {
    const optedOutBusinessId = businessIds[1];
    const disabledBusinessId = businessIds[2];
    const optedOutDelivery = deliveryIds[1];
    const disabledDelivery = deliveryIds[2];
    if (
      !optedOutBusinessId ||
      !disabledBusinessId ||
      !optedOutDelivery ||
      !disabledDelivery
    ) {
      throw new Error('Expected Commerce event policy fixtures');
    }
    const [first, second] = await Promise.all([
      prisma.delivery.findFirstOrThrow({ where: { id: optedOutDelivery } }),
      prisma.delivery.findFirstOrThrow({ where: { id: disabledDelivery } }),
    ]);
    await processor.process({
      name: COMMERCE_DELIVERY_FAILED_EVENT_JOB,
      data: {
        businessId: optedOutBusinessId,
        deliveryId: optedOutDelivery,
        failedAt: first.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: COMMERCE_DELIVERY_FAILED_EVENT_JOB,
      data: {
        businessId: disabledBusinessId,
        deliveryId: disabledDelivery,
        failedAt: second.updatedAt.toISOString(),
      },
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });
});
