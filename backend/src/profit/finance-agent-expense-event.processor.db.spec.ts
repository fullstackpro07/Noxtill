import { ClsService } from 'nestjs-cls';
import { Job, Queue } from 'bullmq';
import { SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import { FINANCE_EXPENSE_RECORDED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { ExpensesService } from '../expenses/expenses.service';
import { FinanceAgentExpenseEventProcessor } from './finance-agent-expense-event.processor';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { S3Service } from '../common/storage/s3.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

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

describe('FinanceAgentExpenseEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentExpenseEventProcessor;
  let expenses: ExpensesService;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let otherBusinessId: string;
  const cls = new FakeClsService();
  const financeQueue = { add: jest.fn().mockResolvedValue(null) };
  const expenseIds: string[] = [];
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

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const [enabled, optedOut, disabled, other] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Finance Expense Event Opt In Test',
          slug: `finance-expense-event-on-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeExpenseEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Expense Event Opt Out Test',
          slug: `finance-expense-event-off-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeExpenseEventReviewEnabled': false,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Expense Event Agent Disabled Test',
          slug: `finance-expense-event-disabled-${stamp}`,
          policies: {
            'agents.financeEnabled': false,
            'agents.financeExpenseEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Expense Event Other Tenant Test',
          slug: `finance-expense-event-other-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeExpenseEventReviewEnabled': true,
          },
        },
      }),
    ]);
    enabledBusinessId = enabled.id;
    optedOutBusinessId = optedOut.id;
    disabledAgentBusinessId = disabled.id;
    otherBusinessId = other.id;

    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    expenses = new ExpensesService(
      tenantPrisma,
      prisma,
      { getSignedDownloadUrl: jest.fn() } as unknown as S3Service,
      financeQueue as unknown as Queue,
    );

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: null,
        input: { month: string; period: 'month' },
        idempotencyKey: string,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef) throw new Error('Expected an Expense event reference');
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

    processor = new FinanceAgentExpenseEventProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: runAgent } as unknown as FinancialIntelligenceService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  beforeEach(() => {
    financeQueue.add.mockClear();
    runAgent.mockClear();
  });

  afterAll(async () => {
    const businessIds = [
      enabledBusinessId,
      optedOutBusinessId,
      disabledAgentBusinessId,
      otherBusinessId,
    ];
    await prisma.specialistAgentRun.deleteMany({
      where: {
        businessId: { in: businessIds },
        agentKey: 'financial_intelligence',
      },
    });
    await prisma.expense.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createExpenseFor(businessId: string) {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const expense = await expenses.create({
      description: `Finance event expense ${Date.now()}`,
      category: 'Operating expense',
      amount: 14.25,
      incurredOn: '2026-10-05',
    });
    expenseIds.push(expense.id);
    return expense;
  }

  it('queues from the saved expense and runs one deterministic, idempotent review', async () => {
    const expense = await createExpenseFor(enabledBusinessId);
    expect(financeQueue.add).toHaveBeenCalledWith(
      FINANCE_EXPENSE_RECORDED_EVENT_JOB,
      { businessId: enabledBusinessId, expenseId: expense.id },
      expect.objectContaining({
        jobId: `finance-expense-${enabledBusinessId}-${expense.id}`,
      }),
    );

    const job = {
      name: FINANCE_EXPENSE_RECORDED_EVENT_JOB,
      data: { businessId: enabledBusinessId, expenseId: expense.id },
    } as Job<unknown>;
    await processor.process(job);
    await processor.process(job);

    const eventId = `finance-expense:${expense.id}`;
    expect(runAgent).toHaveBeenCalledTimes(1);
    const financeCall = runAgent.mock.calls[0];
    if (!financeCall) throw new Error('Expected a Finance expense review');
    const [, actorUserId, input, idempotencyKey, options] = financeCall;
    expect(financeCall[0]).toBe(enabledBusinessId);
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-10', period: 'month' });
    expect(idempotencyKey).toBe(`${eventId}:${enabledBusinessId}`);
    expect(options.triggerType).toBe('event');
    expect(options.includeAiSummary).toBe(false);
    const trace = options.triggerRef;
    if (!trace) throw new Error('Expected a Finance event trace envelope');
    expect(trace).toMatchObject({
      eventId,
      sourceModule: 'expenses',
      entityType: 'Expense',
      entityId: expense.id,
      schemaVersion: 1,
      correlationId: eventId,
    });
    expect(Number.isFinite(Date.parse(trace.occurredAt))).toBe(true);
    expect(typeof trace.entityVersion).toBe('string');
    const run = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId: enabledBusinessId,
        agentKey: 'financial_intelligence',
      },
    });
    expect(run.inputRefs).toEqual([
      expect.objectContaining({ eventId, entityId: expense.id }),
    ]);
  });

  it('does not queue for an opted-out business or a disabled Finance agent', async () => {
    await createExpenseFor(optedOutBusinessId);
    await createExpenseFor(disabledAgentBusinessId);
    expect(financeQueue.add).not.toHaveBeenCalled();
  });

  it('skips a payload that points to another business expense', async () => {
    const expense = await createExpenseFor(otherBusinessId);
    await processor.process({
      name: FINANCE_EXPENSE_RECORDED_EVENT_JOB,
      data: { businessId: enabledBusinessId, expenseId: expense.id },
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();
  });
});
