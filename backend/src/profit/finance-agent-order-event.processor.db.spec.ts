import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { Prisma, SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { FINANCE_ORDER_COMPLETED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { FinanceAgentOrderEventProcessor } from './finance-agent-order-event.processor';

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

describe('FinanceAgentOrderEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentOrderEventProcessor;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let disabledModuleBusinessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
  const orderIds: string[] = [];
  const runAgent = jest.fn<
    Promise<SpecialistAgentRun>,
    [
      string,
      null,
      { month: string; period: 'month' },
      string,
      SpecialistAgentRunOptions,
    ]
  >();
  const stamp = Date.now();
  const completedAt = new Date('2026-10-25T12:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const [enabled, optedOut, disabled, disabledModule, other] =
      await Promise.all([
        prisma.business.create({
          data: {
            name: 'Finance Order Event Opt In Test',
            slug: `finance-order-event-on-${stamp}`,
            policies: {
              'agents.financeEnabled': true,
              'agents.financeCompletedOrderEventReviewEnabled': true,
            },
          },
        }),
        prisma.business.create({
          data: {
            name: 'Finance Order Event Opt Out Test',
            slug: `finance-order-event-off-${stamp}`,
            policies: {
              'agents.financeEnabled': true,
              'agents.financeCompletedOrderEventReviewEnabled': false,
            },
          },
        }),
        prisma.business.create({
          data: {
            name: 'Finance Order Event Agent Disabled Test',
            slug: `finance-order-event-disabled-${stamp}`,
            policies: {
              'agents.financeEnabled': false,
              'agents.financeCompletedOrderEventReviewEnabled': true,
            },
          },
        }),
        prisma.business.create({
          data: {
            name: 'Finance Order Event Module Disabled Test',
            slug: `finance-order-event-module-disabled-${stamp}`,
            disabledModules: ['profit'],
            policies: {
              'agents.financeEnabled': true,
              'agents.financeCompletedOrderEventReviewEnabled': true,
            },
          },
        }),
        prisma.business.create({
          data: {
            name: 'Finance Order Event Other Tenant Test',
            slug: `finance-order-event-other-${stamp}`,
            policies: {
              'agents.financeEnabled': true,
              'agents.financeCompletedOrderEventReviewEnabled': true,
            },
          },
        }),
      ]);
    enabledBusinessId = enabled.id;
    optedOutBusinessId = optedOut.id;
    disabledAgentBusinessId = disabled.id;
    disabledModuleBusinessId = disabledModule.id;
    otherBusinessId = other.id;
    cls = new FakeClsService();

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: null,
        input: { month: string; period: 'month' },
        idempotencyKey: string,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef)
          throw new Error('Expected a Finance order event reference');
        if (actorUserId !== null) {
          throw new Error('Event reviews must not invent a user actor');
        }
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        expect(input).toMatchObject({ month: '2026-10', period: 'month' });
        expect(options).toMatchObject({
          triggerType: 'event',
          includeAiSummary: false,
        });
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'financial_intelligence',
            agentVersion: '1.1.0',
            moduleId: '30',
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

    processor = new FinanceAgentOrderEventProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: runAgent } as unknown as FinancialIntelligenceService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  beforeEach(() => runAgent.mockClear());

  afterAll(async () => {
    const businessIds = [
      enabledBusinessId,
      optedOutBusinessId,
      disabledAgentBusinessId,
      disabledModuleBusinessId,
      otherBusinessId,
    ];
    await prisma.specialistAgentRun.deleteMany({
      where: {
        businessId: { in: businessIds },
        agentKey: 'financial_intelligence',
      },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createOrder(
    businessId: string,
    status: 'completed' | 'pending' = 'completed',
    isQuotation = false,
  ) {
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: orderIds.length + 1,
        status,
        subtotal: new Prisma.Decimal(10),
        total: new Prisma.Decimal(10),
        cogs: new Prisma.Decimal(4),
        isQuotation,
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        updatedAt: completedAt,
      },
    });
    orderIds.push(order.id);
    return order;
  }

  async function processOrder(
    businessId: string,
    orderId: string,
    date = completedAt,
  ) {
    await processor.process({
      name: FINANCE_ORDER_COMPLETED_EVENT_JOB,
      data: {
        businessId,
        orderId,
        completedAt: date.toISOString(),
      },
    } as Job<unknown>);
  }

  it('creates one privacy-minimized daily aggregate review for completed canonical orders', async () => {
    const first = await createOrder(enabledBusinessId);
    const second = await createOrder(enabledBusinessId);

    await processOrder(enabledBusinessId, first.id);
    await processOrder(enabledBusinessId, second.id);
    await processOrder(enabledBusinessId, first.id);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [, actorUserId, input, idempotencyKey, options] =
      runAgent.mock.calls[0];
    const eventId = `finance-completed-orders-daily:${enabledBusinessId}:2026-10:2026-10-25`;
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-10', period: 'month' });
    expect(idempotencyKey).toBe(`${eventId}:${enabledBusinessId}`);
    const triggerRef = options.triggerRef;
    if (!triggerRef)
      throw new Error('Expected a daily Finance trigger reference');
    expect(triggerRef).toMatchObject({
      eventId,
      sourceModule: 'orders',
      entityType: 'Business',
      entityId: enabledBusinessId,
    });
    expect(triggerRef.entityId).not.toBe(first.id);
    expect(triggerRef.entityId).not.toBe(second.id);

    const run = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId: enabledBusinessId,
        agentKey: 'financial_intelligence',
        idempotencyKeyHash: specialistAgentIdempotencyHash(
          `${eventId}:${enabledBusinessId}`,
        ),
      },
    });
    expect(run.inputRefs).toEqual([
      expect.objectContaining({
        eventId,
        sourceModule: 'orders',
        entityType: 'Business',
        entityId: enabledBusinessId,
      }),
    ]);
  });

  it('does not review opted-out, disabled-agent, disabled-module, quotation or incomplete orders', async () => {
    const optedOut = await createOrder(optedOutBusinessId);
    const disabledAgent = await createOrder(disabledAgentBusinessId);
    const disabledModule = await createOrder(disabledModuleBusinessId);
    const quotation = await createOrder(enabledBusinessId, 'completed', true);
    const pending = await createOrder(enabledBusinessId, 'pending');

    await processOrder(optedOutBusinessId, optedOut.id);
    await processOrder(disabledAgentBusinessId, disabledAgent.id);
    await processOrder(disabledModuleBusinessId, disabledModule.id);
    await processOrder(enabledBusinessId, quotation.id);
    await processOrder(enabledBusinessId, pending.id);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('ignores a guessed foreign order id and malformed event payloads', async () => {
    const otherOrder = await createOrder(otherBusinessId);
    await processOrder(enabledBusinessId, otherOrder.id);
    await expect(
      processor.process({
        name: FINANCE_ORDER_COMPLETED_EVENT_JOB,
        data: {
          businessId: enabledBusinessId,
          orderId: '',
          completedAt: 'bad',
        },
      } as Job<unknown>),
    ).rejects.toThrow(
      'Invalid Finance completed-order specialist event payload',
    );
    expect(runAgent).not.toHaveBeenCalled();
  });
});
