import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { Prisma, SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { FINANCE_STATEMENT_IMPORTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { FinanceAgentStatementImportedEventProcessor } from './finance-agent-statement-imported-event.processor';

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

describe('FinanceAgentStatementImportedEventProcessor (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let processor: FinanceAgentStatementImportedEventProcessor;
  let enabledBusinessId: string;
  let optedOutBusinessId: string;
  let disabledAgentBusinessId: string;
  let disabledModuleBusinessId: string;
  let otherBusinessId: string;
  let cls: FakeClsService;
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
  const importedAt = new Date('2026-03-18T12:30:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const businesses = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Finance Statement Event Enabled Test',
          slug: `finance-statement-event-on-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeStatementImportedEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Statement Event Opt Out Test',
          slug: `finance-statement-event-off-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeStatementImportedEventReviewEnabled': false,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Statement Event Agent Disabled Test',
          slug: `finance-statement-event-agent-disabled-${stamp}`,
          policies: {
            'agents.financeEnabled': false,
            'agents.financeStatementImportedEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Statement Event Module Disabled Test',
          slug: `finance-statement-event-module-disabled-${stamp}`,
          disabledModules: ['profit'],
          policies: {
            'agents.financeEnabled': true,
            'agents.financeStatementImportedEventReviewEnabled': true,
          },
        },
      }),
      prisma.business.create({
        data: {
          name: 'Finance Statement Event Other Tenant Test',
          slug: `finance-statement-event-other-${stamp}`,
          policies: {
            'agents.financeEnabled': true,
            'agents.financeStatementImportedEventReviewEnabled': true,
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
        if (actorUserId !== null)
          throw new Error('Event reviews must not invent a user actor');
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        expect(input).toEqual({ month: '2026-03', period: 'month' });
        expect(options).toMatchObject({
          triggerType: 'event',
          includeAiSummary: false,
        });
        expect(options.triggerRef).toMatchObject({
          sourceModule: 'finance',
          entityType: 'FinanceBankStatementImport',
          entityVersion: '2026-03-15:2026-03-17:3',
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
              options.triggerRef?.eventId ?? idempotencyKey,
            ),
            inputRefs: options.triggerRef
              ? [options.triggerRef as Prisma.InputJsonObject]
              : [],
          },
        });
      },
    );
    processor = new FinanceAgentStatementImportedEventProcessor(
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
    await prisma.financeBankStatementImport.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.financeAccount.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  async function createStatement(businessId: string, date = importedAt) {
    const account = await prisma.financeAccount.create({
      data: {
        businessId,
        code: '1000',
        name: 'Test bank account',
        type: 'asset',
      },
    });
    return prisma.financeBankStatementImport.create({
      data: {
        businessId,
        financeAccountId: account.id,
        currencyCode: 'USD',
        periodStart: new Date('2026-03-15T00:00:00.000Z'),
        periodEnd: new Date('2026-03-17T00:00:00.000Z'),
        rowCount: 3,
        sourceHash: `${businessId.replaceAll('-', '').padEnd(64, 'a').slice(0, 64)}`,
        importedByUserId: 'statement-importer',
        createdAt: date,
      },
    });
  }

  async function processStatement(
    businessId: string,
    importId: string,
    date = importedAt,
  ) {
    await processor.process({
      name: FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
      data: { businessId, importId, importedAt: date.toISOString() },
      attemptsMade: 0,
    } as Job<unknown>);
  }

  it('runs one deterministic, read-only review for the exact opted-in statement import', async () => {
    const statement = await createStatement(enabledBusinessId);

    await processStatement(enabledBusinessId, statement.id);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [actualBusinessId, actorUserId, input, idempotencyKey, options] =
      runAgent.mock.calls[0];
    expect(actualBusinessId).toBe(enabledBusinessId);
    expect(actorUserId).toBeNull();
    expect(input).toEqual({ month: '2026-03', period: 'month' });
    expect(idempotencyKey).toEqual(expect.any(String));
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId: `finance-statement-imported:${statement.id}`,
        entityId: statement.id,
        occurredAt: importedAt.toISOString(),
      },
    });
  });

  it('does not run when opted out, disabled, stale or cross-tenant', async () => {
    const optedOut = await createStatement(optedOutBusinessId);
    const disabledAgent = await createStatement(disabledAgentBusinessId);
    const disabledModule = await createStatement(disabledModuleBusinessId);
    const other = await createStatement(otherBusinessId);

    await processStatement(optedOutBusinessId, optedOut.id);
    await processStatement(disabledAgentBusinessId, disabledAgent.id);
    await processStatement(disabledModuleBusinessId, disabledModule.id);
    await processStatement(enabledBusinessId, optedOut.id);
    await processStatement(
      otherBusinessId,
      other.id,
      new Date('2026-03-18T12:30:01.000Z'),
    );

    expect(runAgent).not.toHaveBeenCalled();
  });
});
