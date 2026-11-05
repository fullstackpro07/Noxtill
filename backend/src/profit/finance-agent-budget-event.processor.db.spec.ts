import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { Prisma, SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { FINANCE_BUDGET_APPROVED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { FinanceAgentBudgetEventProcessor } from './finance-agent-budget-event.processor';

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

describe('FinanceAgentBudgetEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentBudgetEventProcessor;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let disabledModuleBusinessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
  const budgetIds: string[] = [];
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
  const reviewedAt = new Date('2026-10-27T13:30:00.000Z');
  const monthStart = new Date('2026-10-01T00:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const businesses = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Finance Budget Event Opt In Test',
          slug: `finance-budget-event-on-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedBudgetEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Budget Event Opt Out Test',
          slug: `finance-budget-event-off-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedBudgetEventReviewEnabled': false,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Budget Event Agent Disabled Test',
          slug: `finance-budget-event-disabled-${stamp}`,
          policies: {
            'agents.financeEnabled': false,
            'agents.financeApprovedBudgetEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Budget Event Module Disabled Test',
          slug: `finance-budget-event-module-disabled-${stamp}`,
          disabledModules: ['profit'],
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedBudgetEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Budget Event Other Tenant Test',
          slug: `finance-budget-event-other-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeApprovedBudgetEventReviewEnabled': true,
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
      async (businessId, actorUserId, input, idempotencyKey, options) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef)
          throw new Error('Expected a Finance budget event reference');
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
    processor = new FinanceAgentBudgetEventProcessor(
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
    await prisma.financeBudget.deleteMany({ where: { id: { in: budgetIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createBudget(
    businessId: string,
    status: 'approved' | 'pending_approval' = 'approved',
  ) {
    const row = await prisma.financeBudget.create({
      data: {
        businessId,
        monthStart,
        category: `QA budget ${budgetIds.length + 1}`,
        currencyCode: 'USD',
        amount: new Prisma.Decimal('125.00'),
        version: 2,
        status,
        createdByUserId: 'finance-budget-event-test-user',
        reviewedByUserId: status === 'approved' ? 'budget-reviewer' : null,
        reviewedAt: status === 'approved' ? reviewedAt : null,
      },
    });
    budgetIds.push(row.id);
    return row;
  }

  async function processBudget(
    businessId: string,
    budgetId: string,
    approvedAt = reviewedAt,
  ) {
    await processor.process({
      name: FINANCE_BUDGET_APPROVED_EVENT_JOB,
      data: {
        businessId,
        budgetId,
        version: 2,
        approvedAt: approvedAt.toISOString(),
      },
    } as Job<unknown>);
  }

  it('creates an idempotent read-only review tied to the approved budget version', async () => {
    const budget = await createBudget(enabledBusinessId);
    await processBudget(enabledBusinessId, budget.id);
    await processBudget(enabledBusinessId, budget.id);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [, actorUserId, input, idempotencyKey, options] =
      runAgent.mock.calls[0];
    const eventId = `finance-approved-budget:${budget.id}:v2`;
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-10', period: 'month' });
    expect(idempotencyKey).toBe(`${eventId}:${enabledBusinessId}`);
    expect(options.triggerRef).toMatchObject({
      eventId,
      sourceModule: 'finance',
      entityType: 'FinanceBudget',
      entityId: budget.id,
      entityVersion: '2026-10:v2',
    });
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

  it('requires opt-in, current approval version and enabled agent/module scope', async () => {
    const optedOut = await createBudget(optedOutBusinessId);
    const disabledAgent = await createBudget(disabledAgentBusinessId);
    const disabledModule = await createBudget(disabledModuleBusinessId);
    const pending = await createBudget(enabledBusinessId, 'pending_approval');
    const foreign = await createBudget(otherBusinessId);
    const stale = await createBudget(enabledBusinessId);

    await processBudget(optedOutBusinessId, optedOut.id);
    await processBudget(disabledAgentBusinessId, disabledAgent.id);
    await processBudget(disabledModuleBusinessId, disabledModule.id);
    await processBudget(enabledBusinessId, pending.id);
    await processBudget(enabledBusinessId, foreign.id);
    await processBudget(
      enabledBusinessId,
      stale.id,
      new Date(reviewedAt.getTime() + 1_000),
    );

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('rejects malformed event data', async () => {
    await expect(
      processor.process({
        name: FINANCE_BUDGET_APPROVED_EVENT_JOB,
        data: {
          businessId: enabledBusinessId,
          budgetId: '',
          version: 0,
          approvedAt: 'invalid',
        },
      } as Job<unknown>),
    ).rejects.toThrow(
      'Invalid Finance approved-budget specialist event payload',
    );
  });
});
