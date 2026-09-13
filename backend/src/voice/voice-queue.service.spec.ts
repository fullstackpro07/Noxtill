import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceQueueService } from './voice-queue.service';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceQueueService (Call Queue, UPD-BE-129)', () => {
  let prisma: PrismaService;
  let service: VoiceQueueService;
  let businessId: string;
  let callCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceQueueService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Voice Queue Test Biz', slug: `voice-queue-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function createCall(overrides: {
    status?: PhoneCallStatus;
    outcome?: PhoneCallOutcome;
    startedAt?: Date;
    resolvedAt?: Date | null;
    customIntentName?: string | null;
  }) {
    callCounter += 1;
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-queue-${callCounter}-${Date.now()}`,
        fromNumber: '+15550001111',
        status: overrides.status ?? PhoneCallStatus.completed,
        outcome: overrides.outcome ?? PhoneCallOutcome.message,
        transcript: [
          {
            speaker: 'assistant',
            text: 'Leave a message',
            at: new Date().toISOString(),
          },
        ],
        startedAt: overrides.startedAt ?? new Date(),
        resolvedAt: overrides.resolvedAt ?? null,
        customIntentName: overrides.customIntentName ?? null,
      },
    });
  }

  it('list() surfaces real pending missed/message/custom calls, oldest first, and excludes resolved/booked/transferred ones', async () => {
    const older = await createCall({
      startedAt: new Date(Date.now() - 60_000),
    });
    const newer = await createCall({ startedAt: new Date() });
    await createCall({ resolvedAt: new Date() }); // already resolved — excluded
    await createCall({ outcome: PhoneCallOutcome.booking }); // booked — excluded
    await createCall({
      status: PhoneCallStatus.missed,
      outcome: PhoneCallOutcome.none,
    });

    const result = await service.list();
    const ids = result.items.map((i) => i.id);
    expect(ids).toContain(older.id);
    expect(ids).toContain(newer.id);
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
    expect(result.items[0].position).toBe(1);
  });

  it('estimatedWaitMinutes is null until there are enough real resolved samples', async () => {
    const result = await service.list();
    expect(result.estimatedWaitMinutes).toBeNull();
  });

  it('estimatedWaitMinutes becomes a real average once enough resolved samples exist', async () => {
    const start = new Date(Date.now() - 10 * 60_000);
    const resolved = new Date();
    await createCall({ startedAt: start, resolvedAt: resolved });
    await createCall({ startedAt: start, resolvedAt: resolved });
    await createCall({ startedAt: start, resolvedAt: resolved });

    // Compute the expected average independently from the real resolved rows now in the DB
    // (a prior test in this file also leaves one resolved sample behind), rather than asserting a
    // magic constant that would silently depend on suite execution order.
    const resolvedRows = await prisma.phoneCall.findMany({
      where: { businessId, resolvedAt: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 20,
      select: { startedAt: true, resolvedAt: true },
    });
    const expectedMinutes = Math.round(
      resolvedRows.reduce(
        (sum, r) =>
          sum + (r.resolvedAt!.getTime() - r.startedAt.getTime()) / 60000,
        0,
      ) / resolvedRows.length,
    );

    const result = await service.list();
    expect(result.estimatedWaitMinutes).toBe(expectedMinutes);
    expect(result.estimatedWaitMinutes).toBeGreaterThan(0);
  });

  it('take() marks a real queue item resolved, removing it from list()', async () => {
    const call = await createCall({});
    await service.take(businessId, call.id);

    const result = await service.list();
    expect(result.items.map((i) => i.id)).not.toContain(call.id);

    const reloaded = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(reloaded.resolvedAt).not.toBeNull();
  });

  it('offerCallback() sets a real callbackRequestedAt without resolving the item', async () => {
    const call = await createCall({});
    await service.offerCallback(businessId, call.id);

    const result = await service.list();
    const item = result.items.find((i) => i.id === call.id);
    expect(item).toBeDefined();
    expect(item?.callbackRequestedAt).not.toBeNull();
  });

  it('clear() bulk-resolves every currently pending item', async () => {
    await createCall({});
    await createCall({});
    const before = await service.list();
    expect(before.items.length).toBeGreaterThan(0);

    const { cleared } = await service.clear(businessId);
    expect(cleared).toBe(before.items.length);

    const after = await service.list();
    expect(after.items).toHaveLength(0);
  });
});
