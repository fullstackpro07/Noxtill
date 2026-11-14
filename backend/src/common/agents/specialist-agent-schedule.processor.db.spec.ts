import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { SpecialistAgentScheduleProcessor } from './specialist-agent-schedule.processor';
import { specialistAgentIdempotencyHash } from './specialist-agent-schedule.util';
import { SpecialistAgentPolicyService } from './specialist-agent-policy.service';

jest.setTimeout(30_000);

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

describe('SpecialistAgentScheduleProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let processor: SpecialistAgentScheduleProcessor;
  let optedInBusinessId: string;
  let defaultBusinessId: string;
  let commerceDisabledBusinessId: string;
  let moduleDisabledBusinessId: string;
  let inactiveBusinessId: string;
  const inventoryRun = jest.fn();
  const otherRuns = [jest.fn(), jest.fn(), jest.fn(), jest.fn()];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();

    const stamp = Date.now();
    optedInBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Schedule Opt In Test',
          slug: `specialist-schedule-optin-${stamp}`,
          policies: {
            'agents.inventoryDailyReviewEnabled': true,
          },
        },
      })
    ).id;
    defaultBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Schedule Default Test',
          slug: `specialist-schedule-default-${stamp}`,
        },
      })
    ).id;
    commerceDisabledBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Schedule Commerce Guard Test',
          slug: `specialist-schedule-commerce-${stamp}`,
          policies: {
            'agents.commerceDailyReviewEnabled': true,
            'agents.commerceEnabled': true,
            'commerce.autonomyLevel': 0,
          },
        },
      })
    ).id;
    moduleDisabledBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Schedule Module Guard Test',
          slug: `specialist-schedule-module-${stamp}`,
          disabledModules: ['inventory'],
          policies: {
            'agents.inventoryDailyReviewEnabled': true,
          },
        },
      })
    ).id;
    inactiveBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Schedule Inactive Branch Test',
          slug: `specialist-schedule-inactive-${stamp}`,
          active: false,
          policies: {
            'agents.inventoryDailyReviewEnabled': true,
          },
        },
      })
    ).id;

    inventoryRun.mockImplementation(
      async (
        businessId: string,
        actorUserId: string | null,
        idempotencyKey: string,
        options: { triggerType: string; includeAiSummary: boolean },
      ) =>
        prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'inventory_intelligence',
            agentVersion: '1.0.0',
            moduleId: '13',
            triggerType: options.triggerType,
            status: 'completed',
            initiatedByUserId: actorUserId,
            idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
            idempotencyRequestHash: 'scheduled-fixture-scope',
          },
        }),
    );

    processor = new SpecialistAgentScheduleProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: inventoryRun } as never,
      { run: otherRuns[0] } as never,
      { run: otherRuns[1] } as never,
      { run: otherRuns[2] } as never,
      { run: otherRuns[3] } as never,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  afterAll(async () => {
    await prisma.specialistAgentRun.deleteMany({
      where: {
        businessId: {
          in: [
            optedInBusinessId,
            defaultBusinessId,
            commerceDisabledBusinessId,
            moduleDisabledBusinessId,
            inactiveBusinessId,
          ],
        },
      },
    });
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
    await prisma.business.deleteMany({
      where: {
        id: {
          in: [
            optedInBusinessId,
            defaultBusinessId,
            commerceDisabledBusinessId,
            moduleDisabledBusinessId,
            inactiveBusinessId,
          ],
        },
      },
    });
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    await prisma.$disconnect();
  });

  beforeEach(() => {
    inventoryRun.mockClear();
    otherRuns.forEach((run) => run.mockClear());
  });

  it('runs only an opted-in enabled agent once per UTC date and leaves commerce off at autonomy zero', async () => {
    const firstTick = new Date('2026-10-25T02:00:00.000Z');
    const firstResult = await processor.runTick(firstTick);
    expect(firstResult.date).toBe('2026-10-25');
    expect(firstResult.checkedBusinesses).toBe(3);
    expect(inventoryRun).toHaveBeenCalledTimes(1);
    expect(inventoryRun).toHaveBeenCalledWith(
      optedInBusinessId,
      null,
      expect.stringContaining(`:${optedInBusinessId}:2026-10-25`),
      { triggerType: 'scheduled', includeAiSummary: false },
    );
    expect(otherRuns.every((run) => run.mock.calls.length === 0)).toBe(true);
    expect(
      await prisma.specialistAgentRun.count({
        where: { businessId: moduleDisabledBusinessId },
      }),
    ).toBe(0);
    expect(
      await prisma.specialistAgentRun.count({
        where: { businessId: inactiveBusinessId },
      }),
    ).toBe(0);

    const run = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { businessId: optedInBusinessId },
    });
    expect(run).toMatchObject({
      triggerType: 'scheduled',
      initiatedByUserId: null,
      status: 'completed',
    });

    await processor.runTick(firstTick);
    expect(inventoryRun).toHaveBeenCalledTimes(1);

    await processor.runTick(new Date('2026-10-26T02:00:00.000Z'));
    expect(inventoryRun).toHaveBeenCalledTimes(2);
    expect(
      await prisma.business.findUnique({ where: { id: defaultBusinessId } }),
    ).not.toBeNull();
    expect(
      await prisma.business.findUnique({
        where: { id: commerceDisabledBusinessId },
      }),
    ).not.toBeNull();
  });
});
