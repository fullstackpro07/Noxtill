import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { Prisma, SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { FINANCE_RETURN_APPROVED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { FinanceAgentReturnEventProcessor } from './finance-agent-return-event.processor';

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

describe('FinanceAgentReturnEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentReturnEventProcessor;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let disabledModuleBusinessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
  const orderIds: string[] = [];
  const returnIds: string[] = [];
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
  const approvedAt = new Date('2026-10-27T13:30:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const businesses = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Finance Return Event Opt In Test',
          slug: `finance-return-event-on-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedReturnEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Return Event Opt Out Test',
          slug: `finance-return-event-off-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedReturnEventReviewEnabled': false,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Return Event Agent Disabled Test',
          slug: `finance-return-event-disabled-${stamp}`,
          policies: {
            'agents.financeEnabled': false,
            'agents.financeApprovedReturnEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Return Event Module Disabled Test',
          slug: `finance-return-event-module-disabled-${stamp}`,
          disabledModules: ['profit'],
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedReturnEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Return Event Other Tenant Test',
          slug: `finance-return-event-other-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedReturnEventReviewEnabled': true,
          },
        },
      }),
    ]);
    [
      enabledBusinessId,
      optedOutBusinessId,
      disabledAgentBusinessId,
      disabledModuleBusinessId,
      otherBusinessId,
    ] = businesses.map((business) => business.id);
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
          throw new Error('Expected a Finance return event reference');
        if (actorUserId !== null)
          throw new Error('Event reviews must not invent a user actor');
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        expect(input).toEqual({ month: '2026-10', period: 'month' });
        expect(options).toMatchObject({
          triggerType: 'event',
          includeAiSummary: false,
        });
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'financial_intelligence',
            agentVersion: '1.0.0',
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
    processor = new FinanceAgentReturnEventProcessor(
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
    await prisma.returnItem.deleteMany({
      where: { returnId: { in: returnIds } },
    });
    await prisma.return.deleteMany({ where: { id: { in: returnIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createReturn(
    businessId: string,
    status: 'approved' | 'pending' = 'approved',
  ) {
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: orderIds.length + 1,
        status: 'completed',
        subtotal: new Prisma.Decimal(20),
        total: new Prisma.Decimal(20),
        cogs: new Prisma.Decimal(8),
      },
    });
    orderIds.push(order.id);
    const returned = await prisma.return.create({
      data: {
        businessId,
        orderId: order.id,
        reason: 'QA finance event record',
        refundMethod: 'cash',
        refundAmount: new Prisma.Decimal(20),
        status,
        createdAt: approvedAt,
        updatedAt: approvedAt,
      },
    });
    returnIds.push(returned.id);
    return returned;
  }

  async function processReturn(
    businessId: string,
    returnId: string,
    date = approvedAt,
  ) {
    await processor.process({
      name: FINANCE_RETURN_APPROVED_EVENT_JOB,
      data: { businessId, returnId, approvedAt: date.toISOString() },
    } as Job<unknown>);
  }

  it('creates one privacy-minimized daily aggregate review for approved returns', async () => {
    const first = await createReturn(enabledBusinessId);
    const second = await createReturn(enabledBusinessId);

    await processReturn(enabledBusinessId, first.id);
    await processReturn(enabledBusinessId, second.id);
    await processReturn(enabledBusinessId, first.id);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [, actorUserId, input, idempotencyKey, options] =
      runAgent.mock.calls[0];
    const eventId = `finance-approved-returns-daily:${enabledBusinessId}:2026-10:2026-10-27`;
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-10', period: 'month' });
    expect(idempotencyKey).toBe(`${eventId}:${enabledBusinessId}`);
    expect(options.triggerRef).toMatchObject({
      eventId,
      sourceModule: 'orders',
      entityType: 'Business',
      entityId: enabledBusinessId,
    });
    expect(options.triggerRef?.entityId).not.toBe(first.id);
    expect(options.triggerRef?.entityId).not.toBe(second.id);
    await expect(
      prisma.specialistAgentRun.findFirst({
        where: {
          businessId: enabledBusinessId,
          agentKey: 'financial_intelligence',
          idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
        },
      }),
    ).resolves.toMatchObject({ status: 'completed' });
  });

  it('does not review opted-out, disabled-agent, disabled-module, pending or foreign returns', async () => {
    const optedOut = await createReturn(optedOutBusinessId);
    const disabledAgent = await createReturn(disabledAgentBusinessId);
    const disabledModule = await createReturn(disabledModuleBusinessId);
    const pending = await createReturn(enabledBusinessId, 'pending');
    const foreign = await createReturn(otherBusinessId);

    await processReturn(optedOutBusinessId, optedOut.id);
    await processReturn(disabledAgentBusinessId, disabledAgent.id);
    await processReturn(disabledModuleBusinessId, disabledModule.id);
    await processReturn(enabledBusinessId, pending.id);
    await processReturn(enabledBusinessId, foreign.id);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('refuses a stale approval timestamp and malformed event payloads', async () => {
    const returned = await createReturn(enabledBusinessId);
    await processReturn(
      enabledBusinessId,
      returned.id,
      new Date(approvedAt.getTime() + 1_000),
    );
    expect(runAgent).not.toHaveBeenCalled();
    await expect(
      processor.process({
        name: FINANCE_RETURN_APPROVED_EVENT_JOB,
        data: {
          businessId: enabledBusinessId,
          returnId: '',
          approvedAt: 'bad',
        },
      } as Job<unknown>),
    ).rejects.toThrow(
      'Invalid Finance approved-return specialist event payload',
    );
  });
});
