import { AppException } from '../filters/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { createOrReuseSpecialistAgentRun } from './specialist-agent-run-idempotency.util';
import { Prisma } from '@prisma/client';
import { SPECIALIST_AGENT_REGISTRY } from './specialist-agent-registry';

describe('specialist agent run idempotency (MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;
  const actorUserId = `agent-idempotency-user-${Date.now()}`;

  const create = (data: Prisma.SpecialistAgentRunUncheckedCreateInput) =>
    prisma.specialistAgentRun.create({ data });
  const findByKey = (
    keyBusinessId: string,
    agentKey: string,
    idempotencyKeyHash: string,
  ) =>
    prisma.specialistAgentRun.findFirst({
      where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
    });
  const runData = (
    agentKey = 'inventory_intelligence',
    initiatedByUserId: string | null = actorUserId,
  ): Prisma.SpecialistAgentRunUncheckedCreateInput => ({
    businessId,
    agentKey,
    agentVersion: '1.0.0',
    moduleId:
      SPECIALIST_AGENT_REGISTRY.find((agent) => agent.agentKey === agentKey)
        ?.moduleId ?? '13',
    status: 'running',
    initiatedByUserId,
  });

  const createRun = (
    requestScope: unknown = { businessId },
    key = 'inventory-review-request-0001',
  ) =>
    createOrReuseSpecialistAgentRun(
      create,
      findByKey,
      runData(),
      key,
      requestScope,
    );

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Specialist Run Idempotency Test',
        slug: `specialist-run-idempotency-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.specialistAgentRun.deleteMany({ where: { businessId } });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: businessId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.specialistAgentRun.deleteMany({ where: { businessId } });
  });

  it('returns the original run for a same-key, same-user, same-scope retry', async () => {
    const [first, replay] = await Promise.all([createRun(), createRun()]);
    const created = [first, replay].find((result) => !result.reused);
    const reused = [first, replay].find((result) => result.reused);

    expect(created).toBeDefined();
    expect(reused).toBeDefined();
    expect(reused?.run.id).toBe(created?.run.id);
    expect(
      await prisma.specialistAgentRun.count({
        where: { businessId, agentKey: 'inventory_intelligence' },
      }),
    ).toBe(1);
  });

  it('rejects reuse of a key with a different request scope or initiating user', async () => {
    await createRun();
    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        runData(),
        'inventory-review-request-0001',
        { businessId, branchId: 'different-branch' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_IDEMPOTENCY_CONFLICT' },
    });

    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        runData('inventory_intelligence', 'another-user'),
        'inventory-review-request-0001',
        { businessId },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_IDEMPOTENCY_CONFLICT' },
    });
    expect(
      await prisma.specialistAgentRun.count({ where: { businessId } }),
    ).toBe(1);
  });

  it('scopes unique keys to a specialist and preserves legacy calls without a key', async () => {
    const first = await createRun();
    const secondAgent = await createOrReuseSpecialistAgentRun(
      create,
      findByKey,
      runData('financial_intelligence'),
      'inventory-review-request-0001',
      { businessId },
    );
    const legacyA = await createOrReuseSpecialistAgentRun(
      create,
      findByKey,
      runData('inventory_intelligence'),
      undefined,
      { businessId },
    );
    const legacyB = await createOrReuseSpecialistAgentRun(
      create,
      findByKey,
      runData('inventory_intelligence'),
      undefined,
      { businessId },
    );

    expect(secondAgent.reused).toBe(false);
    expect(legacyA.reused).toBe(false);
    expect(legacyB.reused).toBe(false);
    expect(
      new Set([
        first.run.id,
        secondAgent.run.id,
        legacyA.run.id,
        legacyB.run.id,
      ]).size,
    ).toBe(4);
  });

  it('rejects malformed keys before writing a run', async () => {
    await expect(
      createOrReuseSpecialistAgentRun(create, findByKey, runData(), 'short', {
        businessId,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(
      await prisma.specialistAgentRun.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('rejects unregistered agents and unsupported triggers before writing', async () => {
    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        runData('unregistered_agent'),
        undefined,
        { businessId },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_KEY_INVALID' },
    });

    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        { ...runData(), moduleId: '29' },
        undefined,
        { businessId },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_MODULE_MISMATCH' },
    });

    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        { ...runData(), triggerType: 'webhook' },
        undefined,
        { businessId },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_TRIGGER_NOT_ALLOWED' },
    });

    await expect(
      createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        {
          ...runData('specialist_agent_orchestrator'),
          moduleId: 'shared',
          triggerType: 'scheduled',
        },
        undefined,
        { businessId },
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_TRIGGER_NOT_ALLOWED' },
    });

    expect(
      await prisma.specialistAgentRun.count({ where: { businessId } }),
    ).toBe(0);
  });

  it.each(['event', 'scheduled'] as const)(
    'accepts registered %s runs',
    async (triggerType) => {
      const result = await createOrReuseSpecialistAgentRun(
        create,
        findByKey,
        { ...runData(), triggerType },
        undefined,
        { businessId, triggerType },
      );
      expect(result.run).toMatchObject({ triggerType });
    },
  );

  it('does not turn a failed prior run into a successful retry response', async () => {
    const first = await createRun();
    await prisma.specialistAgentRun.update({
      where: { id: first.run.id },
      data: { status: 'failed' },
    });

    await expect(createRun()).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_PREVIOUS_RUN_FAILED' },
    });
    expect(
      await prisma.specialistAgentRun.count({ where: { businessId } }),
    ).toBe(1);
  });
});
