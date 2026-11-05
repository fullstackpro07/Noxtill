import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { SeoSpecialistAgentService } from './seo-specialist-agent.service';
import { SeoAuditAgentEventProcessor } from './seo-audit-agent-event.processor';
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

describe('SeoAuditAgentEventProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let processor: SeoAuditAgentEventProcessor;
  const runAgent = jest.fn<
    Promise<SpecialistAgentRun>,
    [string, string | null, string, SpecialistAgentRunOptions]
  >();
  const cls = new FakeClsService();
  const createdBusinessIds: string[] = [];
  const createdAuditIds: string[] = [];

  beforeEach(() => runAgent.mockClear());

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const enabled = await prisma.business.create({
      data: {
        name: 'SEO Audit Event Opt-In Test',
        slug: `seo-audit-event-enabled-${stamp}`,
        policies: {
          'agents.seoEnabled': true,
          'agents.seoAuditEventReviewEnabled': true,
        },
      },
    });
    const optedOut = await prisma.business.create({
      data: {
        name: 'SEO Audit Event Opt-Out Test',
        slug: `seo-audit-event-disabled-${stamp}`,
        policies: {
          'agents.seoEnabled': true,
          'agents.seoAuditEventReviewEnabled': false,
        },
      },
    });
    createdBusinessIds.push(enabled.id, optedOut.id);

    const completedAudit = await prisma.seoAuditRun.create({
      data: {
        businessId: enabled.id,
        siteUrl: 'https://example.com/',
        status: 'completed',
      },
    });
    const partialAudit = await prisma.seoAuditRun.create({
      data: {
        businessId: optedOut.id,
        siteUrl: 'https://example.org/',
        status: 'partial',
      },
    });
    const failedAudit = await prisma.seoAuditRun.create({
      data: {
        businessId: enabled.id,
        siteUrl: 'https://example.com/',
        status: 'failed',
      },
    });
    createdAuditIds.push(completedAudit.id, partialAudit.id, failedAudit.id);

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: string | null,
        idempotencyKey: string,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef)
          throw new Error('Expected an SEO audit event reference');
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'seo_autopilot',
            agentVersion: '1.0.0',
            moduleId: '28',
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

    processor = new SeoAuditAgentEventProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: runAgent } as unknown as SeoSpecialistAgentService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  afterAll(async () => {
    if (createdBusinessIds.length > 0) {
      await prisma.specialistAgentRun.deleteMany({
        where: {
          businessId: { in: createdBusinessIds },
          agentKey: 'seo_autopilot',
        },
      });
      await prisma.seoAuditRun.deleteMany({
        where: {
          id: { in: createdAuditIds },
          businessId: { in: createdBusinessIds },
        },
      });
      await prisma.business.deleteMany({
        where: { id: { in: createdBusinessIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('runs once for an opted-in completed audit and stores its trigger source', async () => {
    const business = await prisma.business.findFirstOrThrow({
      where: { id: createdBusinessIds[0] },
    });
    const audit = await prisma.seoAuditRun.findFirstOrThrow({
      where: { id: createdAuditIds[0] },
    });
    const job = {
      name: 'seo-audit-completed',
      data: { businessId: business.id, auditRunId: audit.id },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected the SEO agent to run');
    const [businessId, actorUserId, idempotencyKey, options] = call;
    expect(businessId).toBe(business.id);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toBe(
      `seo-audit-completed:${audit.id}:${business.id}`,
    );
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId: `seo-audit-completed:${audit.id}`,
        sourceModule: 'marketing',
        entityType: 'SeoAuditRun',
        entityId: audit.id,
      },
    });
    const saved = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId: business.id,
        agentKey: 'seo_autopilot',
        triggerType: 'event',
        idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
      },
    });
    expect(saved.initiatedByUserId).toBeNull();
    expect(saved.inputRefs).toEqual([options.triggerRef]);
  });

  it('does not run for opted-out businesses, failed audits or cross-tenant IDs', async () => {
    await processor.process({
      name: 'seo-audit-completed',
      data: {
        businessId: createdBusinessIds[1],
        auditRunId: createdAuditIds[1],
      },
    } as Job<unknown>);
    await processor.process({
      name: 'seo-audit-completed',
      data: {
        businessId: createdBusinessIds[0],
        auditRunId: createdAuditIds[2],
      },
    } as Job<unknown>);
    await processor.process({
      name: 'seo-audit-completed',
      data: {
        businessId: createdBusinessIds[1],
        auditRunId: createdAuditIds[0],
      },
    } as Job<unknown>);

    expect(runAgent).toHaveBeenCalledTimes(0);
  });
});
