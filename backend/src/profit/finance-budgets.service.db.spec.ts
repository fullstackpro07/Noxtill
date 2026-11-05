import { ClsService } from 'nestjs-cls';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FINANCE_BUDGET_APPROVED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.values[key] as T;
  }

  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('FinanceBudgetsService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: FinanceBudgetsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  const financeAgentEvents = { add: jest.fn() };
  const month = new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 15));

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    service = new FinanceBudgetsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      cls as unknown as ClsService,
      financeAgentEvents as unknown as Queue,
    );
    const stamp = `${Date.now()}-${process.pid}`;
    [businessId, otherBusinessId] = await Promise.all([
      prisma.business
        .create({
          data: {
            name: 'Finance Budget Test',
            slug: `finance-budget-${stamp}`,
          },
        })
        .then((row) => row.id),
      prisma.business
        .create({
          data: {
            name: 'Finance Budget Other Tenant',
            slug: `finance-budget-other-${stamp}`,
          },
        })
        .then((row) => row.id),
    ]);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(async () => {
    financeAgentEvents.add.mockReset().mockResolvedValue(undefined);
    await prisma.financeBudget.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.expense.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    if (businessId && otherBusinessId) {
      await prisma.financeBudget.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await prisma.expense.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: [businessId, otherBusinessId] } },
      });
    }
    await prisma.$disconnect();
  });

  it('keeps submitted and reviewed budget versions immutable and records a reason for decisions', async () => {
    const first = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Rent',
      amount: '100.00',
      note: 'Monthly premises budget',
    });
    const updatedDraft = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Rent',
      amount: '110.00',
    });
    expect(updatedDraft.id).toBe(first.id);
    expect(updatedDraft.amount.toFixed(2)).toBe('110.00');
    expect(updatedDraft.version).toBe(1);

    await service.submit(businessId, first.id);
    await expect(
      service.saveDraft(businessId, 'budget-author', {
        month,
        category: 'Rent',
        amount: '120.00',
      }),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_BUDGET_ALREADY_PENDING' },
    });

    const approved = await service.decide(
      businessId,
      'budget-reviewer',
      first.id,
      'approved',
      'Reviewed against this month operating plan',
    );
    expect(approved).toMatchObject({
      status: 'approved',
      reviewedByUserId: 'budget-reviewer',
      reviewReason: 'Reviewed against this month operating plan',
    });

    const revision = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Rent',
      amount: '125.00',
    });
    expect(revision).toMatchObject({ status: 'draft', version: 2 });
    await service.submit(businessId, revision.id);
    const rejected = await service.decide(
      businessId,
      'budget-reviewer',
      revision.id,
      'rejected',
      'Amount needs a supplier quote before approval',
    );
    expect(rejected.status).toBe('rejected');

    const period = await service.list(businessId, month);
    expect(period.lines.find((line) => line.category === 'Rent')).toMatchObject(
      {
        approvedBudget: { id: first.id, amount: '110.00', version: 1 },
        latestRevision: {
          id: revision.id,
          amount: '125.00',
          version: 2,
          status: 'rejected',
        },
      },
    );
    expect(period.currencyCode).toBe('USD');
    expect(period.scope).toBe('business_wide');
  });

  it('compares only same-business, same-month expenses with the latest approved category budget', async () => {
    await Promise.all([
      prisma.expense.create({
        data: {
          businessId,
          description: 'Rent invoice',
          category: 'Rent',
          amount: '120.00',
          incurredOn: monthStart,
        },
      }),
      prisma.expense.create({
        data: {
          businessId,
          description: 'Utility invoice',
          category: 'Utilities',
          amount: '30.00',
          incurredOn: new Date(nextMonth.getTime() - 86_400_000),
        },
      }),
      prisma.expense.create({
        data: {
          businessId,
          description: 'Prior month rent',
          category: 'Rent',
          amount: '900.00',
          incurredOn: previousMonth,
        },
      }),
      prisma.expense.create({
        data: {
          businessId: otherBusinessId,
          description: 'Other business rent',
          category: 'Rent',
          amount: '700.00',
          incurredOn: monthStart,
        },
      }),
    ]);
    const rent = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Rent',
      amount: '100.00',
    });
    await service.submit(businessId, rent.id);
    await service.decide(
      businessId,
      'budget-reviewer',
      rent.id,
      'approved',
      'Approved for this month',
    );
    const utilities = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Utilities',
      amount: '50.00',
    });

    const period = await service.list(businessId, month);
    const rentLine = period.lines.find((line) => line.category === 'Rent');
    const utilityLine = period.lines.find(
      (line) => line.category === 'Utilities',
    );
    expect(rentLine).toMatchObject({
      actualAmount: '120.00',
      variance: '20.00',
      approvedBudget: { amount: '100.00', version: 1 },
      latestRevision: { status: 'approved' },
    });
    expect(utilityLine).toMatchObject({
      actualAmount: '30.00',
      approvedBudget: null,
      latestRevision: { id: utilities.id, status: 'draft' },
      variance: null,
    });
    expect(rentLine?.actualAmount).toBe('120.00');
    await expect(service.list(otherBusinessId, month)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('queues a read-only Finance review after an opted-in budget approval commits', async () => {
    const draft = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Approved event QA',
      amount: '125.00',
    });
    await service.submit(businessId, draft.id);
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.financeEnabled': true,
          'agents.financeApprovedBudgetEventReviewEnabled': true,
        },
      },
    });
    financeAgentEvents.add.mockImplementation(
      async (_name: string, data: { budgetId: string }) => {
        const committed = await prisma.financeBudget.findUnique({
          where: { id: data.budgetId },
        });
        expect(committed?.status).toBe('approved');
      },
    );

    const approved = await service.decide(
      businessId,
      'budget-reviewer',
      draft.id,
      'approved',
      'Approved after reviewing expenses',
    );

    expect(financeAgentEvents.add).toHaveBeenCalledWith(
      FINANCE_BUDGET_APPROVED_EVENT_JOB,
      {
        businessId,
        budgetId: draft.id,
        version: draft.version,
        approvedAt: approved.reviewedAt?.toISOString(),
      },
      expect.objectContaining({
        jobId: `finance-budget-approved-${businessId}-${draft.id}-v${draft.version}`,
        attempts: 3,
      }),
    );
  });

  it('does not queue by default or for rejected budgets and keeps approvals if queueing fails', async () => {
    const defaultOff = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Manual review only',
      amount: '50.00',
    });
    await service.submit(businessId, defaultOff.id);
    await service.decide(
      businessId,
      'budget-reviewer',
      defaultOff.id,
      'approved',
      'Approved without event review',
    );
    expect(financeAgentEvents.add).not.toHaveBeenCalled();

    const rejected = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Rejected event QA',
      amount: '45.00',
    });
    await service.submit(businessId, rejected.id);
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.financeEnabled': true,
          'agents.financeApprovedBudgetEventReviewEnabled': true,
        },
      },
    });
    await service.decide(
      businessId,
      'budget-reviewer',
      rejected.id,
      'rejected',
      'Rejected after reviewing expenses',
    );
    expect(financeAgentEvents.add).not.toHaveBeenCalled();

    const approved = await service.saveDraft(businessId, 'budget-author', {
      month,
      category: 'Queue outage QA',
      amount: '75.00',
    });
    await service.submit(businessId, approved.id);
    financeAgentEvents.add.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );
    await expect(
      service.decide(
        businessId,
        'budget-reviewer',
        approved.id,
        'approved',
        'Approved while the queue is unavailable',
      ),
    ).resolves.toMatchObject({ status: 'approved' });
    await expect(
      prisma.financeBudget.findUnique({ where: { id: approved.id } }),
    ).resolves.toMatchObject({ status: 'approved' });
  });
});
