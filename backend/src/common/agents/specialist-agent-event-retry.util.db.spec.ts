import { PrismaService } from '../../prisma/prisma.service';
import { resolveSpecialistAgentEventAttempt } from './specialist-agent-event-retry.util';
import { specialistAgentIdempotencyHash } from './specialist-agent-run-idempotency.util';

describe('resolveSpecialistAgentEventAttempt (MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const business = await prisma.business.create({
      data: {
        name: 'Specialist Event Retry Test',
        slug: `specialist-event-retry-${stamp}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.specialistAgentRun.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  it('allows a new attempt after failure and blocks existing running or completed attempts', async () => {
    const baseIdempotencyKey = `retry-test:${businessId}`;
    const first = await resolveSpecialistAgentEventAttempt(prisma, {
      businessId,
      agentKey: 'inventory_intelligence',
      baseIdempotencyKey,
      attemptsMade: 0,
    });
    expect(first).toEqual({
      shouldRun: true,
      idempotencyKey: baseIdempotencyKey,
    });

    await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'event',
        status: 'failed',
        idempotencyKeyHash: specialistAgentIdempotencyHash(
          first.idempotencyKey,
        ),
      },
    });

    const second = await resolveSpecialistAgentEventAttempt(prisma, {
      businessId,
      agentKey: 'inventory_intelligence',
      baseIdempotencyKey,
      attemptsMade: 1,
    });
    expect(second).toEqual({
      shouldRun: true,
      idempotencyKey: `${baseIdempotencyKey}:retry:1`,
    });

    const retry = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'event',
        status: 'running',
        idempotencyKeyHash: specialistAgentIdempotencyHash(
          second.idempotencyKey,
        ),
      },
    });
    const blockedByRunning = await resolveSpecialistAgentEventAttempt(prisma, {
      businessId,
      agentKey: 'inventory_intelligence',
      baseIdempotencyKey,
      attemptsMade: 2,
    });
    expect(blockedByRunning).toEqual({
      shouldRun: false,
      idempotencyKey: `${baseIdempotencyKey}:retry:2`,
    });

    await prisma.specialistAgentRun.update({
      where: { id: retry.id },
      data: { status: 'completed' },
    });
    const blockedByCompleted = await resolveSpecialistAgentEventAttempt(
      prisma,
      {
        businessId,
        agentKey: 'inventory_intelligence',
        baseIdempotencyKey,
        attemptsMade: 2,
      },
    );
    expect(blockedByCompleted.shouldRun).toBe(false);
  });

  it('does not start a queued event review for an inactive business', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { active: false },
    });

    const attempt = await resolveSpecialistAgentEventAttempt(prisma, {
      businessId,
      agentKey: 'inventory_intelligence',
      baseIdempotencyKey: `inactive-event:${businessId}`,
      attemptsMade: 0,
    });

    expect(attempt).toEqual({
      shouldRun: false,
      idempotencyKey: `inactive-event:${businessId}`,
    });
  });
});
