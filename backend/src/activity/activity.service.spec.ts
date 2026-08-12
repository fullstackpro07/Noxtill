import { ClsService } from 'nestjs-cls';
import { EMPTY, lastValueFrom, toArray } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityService } from './activity.service';
import { ActivityPubSubService } from './activity-pubsub.service';
import { activityChannel } from './activity.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ActivityService (UPD-BE-002)', () => {
  let prisma: PrismaService;
  let service: ActivityService;
  let businessId: string;
  const pubsub = { publish: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ActivityService(
      tenantPrisma,
      pubsub as unknown as ActivityPubSubService,
    );

    const business = await prisma.business.create({
      data: { name: 'Activity Test Biz', slug: `activity-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    pubsub.publish.mockClear();
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('persists a real ActivityEvent row and broadcasts it on the business channel', async () => {
    await service.record(businessId, {
      type: 'sale',
      description: 'Sale #1 — 50',
      amount: 50,
      entityType: 'Order',
      entityId: 'order-1',
    });

    const rows = await prisma.activityEvent.findMany({ where: { businessId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('sale');
    expect(Number(rows[0].amount)).toBe(50);

    expect(pubsub.publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = pubsub.publish.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(channel).toBe(activityChannel(businessId));
    expect(payload).toMatchObject({
      type: 'sale',
      description: 'Sale #1 — 50',
      amount: 50,
    });
  });

  it('never throws, even when the underlying write itself fails', async () => {
    // A businessId that merely doesn't exist wouldn't actually exercise this: the tenant-scoping
    // extension overwrites `data.businessId` with whatever's bound in CLS regardless of what's
    // passed in, so it would silently succeed against the real (CLS-bound) test business instead.
    // An invalid enum value is a real, reliable DB-level rejection that never persists a row —
    // Prisma's own $disconnect()/$connect() silently auto-reconnects on the next query, so it
    // can't be used to force a failure here.
    await expect(
      service.record(businessId, {
        type: 'not-a-real-type' as never,
        description: 'should not throw',
      }),
    ).resolves.toBeUndefined();

    const rows = await prisma.activityEvent.findMany({
      where: { businessId, description: 'should not throw' },
    });
    expect(rows).toHaveLength(0);
  });

  it('returns recent history oldest-first, capped at the requested limit', async () => {
    await service.record(businessId, {
      type: 'booking',
      description: 'Booking A',
    });
    await service.record(businessId, {
      type: 'booking',
      description: 'Booking B',
    });

    const history = await service.getRecentHistory(businessId, 2);
    expect(history).toHaveLength(2);
    expect(history[0].description).toBe('Booking A');
    expect(history[1].description).toBe('Booking B');
  });

  it('stream() replays real history in order before live-tailing new events', async () => {
    const pubsubWithSubscribe = pubsub as unknown as ActivityPubSubService & {
      subscribe: jest.Mock;
    };
    pubsubWithSubscribe.subscribe = jest.fn().mockReturnValue(EMPTY);

    const events = await lastValueFrom(
      service.stream(businessId).pipe(toArray()),
    );
    const seen = events.map(
      (event) => (event.data as { description: string }).description,
    );

    // EMPTY completes immediately with no live events, so every emission seen here came from the
    // real DB history, oldest-first — includes every event recorded by earlier tests in this file.
    expect(seen).toEqual(['Sale #1 — 50', 'Booking A', 'Booking B']);
    expect(pubsubWithSubscribe.subscribe).toHaveBeenCalledWith(
      activityChannel(businessId),
    );
  });
});
