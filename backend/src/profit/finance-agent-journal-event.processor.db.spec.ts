import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { Prisma, SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { FINANCE_JOURNAL_POSTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { FinanceAgentJournalEventProcessor } from './finance-agent-journal-event.processor';

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

describe('FinanceAgentJournalEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentJournalEventProcessor;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let disabledModuleBusinessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
  const journalIds: string[] = [];
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
  const postedAt = new Date('2026-10-27T13:30:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const businesses = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Finance Journal Event Opt In Test',
          slug: `finance-journal-event-on-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financePostedJournalEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Journal Event Opt Out Test',
          slug: `finance-journal-event-off-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financePostedJournalEventReviewEnabled': false,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Journal Event Agent Disabled Test',
          slug: `finance-journal-event-disabled-${stamp}`,
          policies: {
            'agents.financeEnabled': false,
            'agents.financePostedJournalEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Journal Event Module Disabled Test',
          slug: `finance-journal-event-module-disabled-${stamp}`,
          disabledModules: ['profit'],
          policies: {
            'agents.financeEnabled': true,
            'agents.financePostedJournalEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Journal Event Other Tenant Test',
          slug: `finance-journal-event-other-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financePostedJournalEventReviewEnabled': true,
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
          throw new Error('Expected a Finance posted-journal event reference');
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
    processor = new FinanceAgentJournalEventProcessor(
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
    await prisma.financeJournalEntry.deleteMany({
      where: { id: { in: journalIds } },
    });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createPostedJournal(businessId: string) {
    const journal = await prisma.financeJournalEntry.create({
      data: {
        businessId,
        reference: `QA-JOURNAL-EVENT-${journalIds.length + 1}`,
        entryDate: new Date('2026-10-13T00:00:00.000Z'),
        currencyCode: 'USD',
        description: 'Posted journal specialist event fixture',
        status: 'posted',
        totalDebits: new Prisma.Decimal('40.00'),
        totalCredits: new Prisma.Decimal('40.00'),
        createdByUserId: 'finance-journal-event-test-user',
        postedByUserId: 'finance-journal-event-poster',
        postedAt,
      },
    });
    journalIds.push(journal.id);
    return journal;
  }

  async function processJournal(
    businessId: string,
    journalId: string,
    sourcePostedAt = postedAt,
  ) {
    await processor.process({
      name: FINANCE_JOURNAL_POSTED_EVENT_JOB,
      data: {
        businessId,
        journalId,
        postedAt: sourcePostedAt.toISOString(),
      },
    } as Job<unknown>);
  }

  it('creates one read-only run pinned to the canonically posted journal', async () => {
    const journal = await createPostedJournal(enabledBusinessId);
    await processJournal(enabledBusinessId, journal.id);
    await processJournal(enabledBusinessId, journal.id);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [, actorUserId, input, idempotencyKey, options] =
      runAgent.mock.calls[0];
    const eventId = `finance-posted-journal:${journal.id}`;
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-10', period: 'month' });
    expect(idempotencyKey).toBe(`${eventId}:${enabledBusinessId}`);
    expect(options.triggerRef).toMatchObject({
      eventId,
      sourceModule: 'finance',
      entityType: 'FinanceJournalEntry',
      entityId: journal.id,
      entityVersion: `2026-10-13:posted:${postedAt.toISOString()}`,
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

  it('requires opt-in, current posted state, current agent/module and the owning tenant', async () => {
    const optedOut = await createPostedJournal(optedOutBusinessId);
    const disabledAgent = await createPostedJournal(disabledAgentBusinessId);
    const disabledModule = await createPostedJournal(disabledModuleBusinessId);
    const foreign = await createPostedJournal(otherBusinessId);
    const stale = await createPostedJournal(enabledBusinessId);
    const changed = await prisma.financeJournalEntry.create({
      data: {
        businessId: enabledBusinessId,
        reference: `QA-JOURNAL-EVENT-CHANGED-${journalIds.length + 1}`,
        entryDate: new Date('2026-10-13T00:00:00.000Z'),
        currencyCode: 'USD',
        description: 'Journal no longer posted when event is consumed',
        status: 'approved',
        totalDebits: new Prisma.Decimal('40.00'),
        totalCredits: new Prisma.Decimal('40.00'),
        createdByUserId: 'finance-journal-event-test-user',
      },
    });
    journalIds.push(changed.id);

    await processJournal(optedOutBusinessId, optedOut.id);
    await processJournal(disabledAgentBusinessId, disabledAgent.id);
    await processJournal(disabledModuleBusinessId, disabledModule.id);
    await processJournal(enabledBusinessId, foreign.id);
    await processJournal(
      enabledBusinessId,
      stale.id,
      new Date(postedAt.getTime() + 1_000),
    );
    await processJournal(enabledBusinessId, changed.id);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('rejects malformed event data', async () => {
    await expect(
      processor.process({
        name: FINANCE_JOURNAL_POSTED_EVENT_JOB,
        data: { businessId: enabledBusinessId, journalId: '', postedAt: 'bad' },
      } as Job<unknown>),
    ).rejects.toThrow(
      'Invalid Finance posted-journal specialist event payload',
    );
    expect(runAgent).not.toHaveBeenCalled();
  });
});
