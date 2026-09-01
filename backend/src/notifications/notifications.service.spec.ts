import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { NotificationsService } from './notifications.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('NotificationsService (INT-012)', () => {
  let prisma: PrismaService;
  let service: NotificationsService;
  let businessId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new NotificationsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Notifications Test Biz',
        slug: `notifications-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const userA = await prisma.user.create({
      data: {
        name: 'User A',
        email: `notif-a-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userAId = userA.id;
    const userB = await prisma.user.create({
      data: {
        name: 'User B',
        email: `notif-b-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userBId = userB.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: userAId, role: 'staff' },
        { businessId, userId: userBId, role: 'staff' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { businessId } });
    await prisma.notificationPreference.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await prisma.$disconnect();
  });

  it('create() writes a real notification scoped to the recipient', async () => {
    const created = await service.create(businessId, userAId, {
      title: 'Export ready',
      body: 'Your export is ready.',
      link: 'https://signed.example/export.zip',
    });
    expect(created).not.toBeNull();
    expect(created?.userId).toBe(userAId);
    expect(created?.read).toBe(false);
  });

  it("list() only returns the calling user's own notifications, not another user's", async () => {
    await service.create(businessId, userBId, {
      title: 'For B only',
      body: 'x',
    });

    const listA = await service.list(userAId);
    const listB = await service.list(userBId);

    expect(listA.some((n) => n.title === 'For B only')).toBe(false);
    expect(listB.some((n) => n.title === 'For B only')).toBe(true);
  });

  it('markRead() flips the read flag for the owning user', async () => {
    const created = await service.create(businessId, userAId, {
      title: 'Mark me',
      body: 'x',
    });
    const updated = await service.markRead(userAId, created!.id);
    expect(updated.read).toBe(true);
  });

  it("markRead() rejects a user trying to mark another user's notification", async () => {
    const created = await service.create(businessId, userAId, {
      title: 'Not yours',
      body: 'x',
    });
    await expect(service.markRead(userBId, created!.id)).rejects.toThrow();
  });

  describe('Preference matrix (UPD-BE-122)', () => {
    it('getPreferenceMatrix() defaults every real event to enabled when nothing has been set', async () => {
      const rows = await service.getPreferenceMatrix(businessId, userAId);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.enabled)).toBe(true);
      expect(rows.every((r) => !r.overridden)).toBe(true);
    });

    it('setPreferences() with no userId writes the real business-wide default', async () => {
      const rows = await service.setPreferences(businessId, {
        preferences: [
          { event: 'export_ready', channel: 'in_app', enabled: false },
        ],
      });
      const row = rows.find((r) => r.event === 'export_ready');
      expect(row?.enabled).toBe(false);
      expect(row?.enabledByDefault).toBe(false);
    });

    it('a real create() call is silently skipped once the recipient disabled that event, and real once re-enabled', async () => {
      await service.setPreferences(businessId, {
        userId: userAId,
        preferences: [
          { event: 'export_ready', channel: 'in_app', enabled: false },
        ],
      });

      const skipped = await service.create(
        businessId,
        userAId,
        { title: 'Should be skipped', body: 'x' },
        'export_ready',
      );
      expect(skipped).toBeNull();

      await service.setPreferences(businessId, {
        userId: userAId,
        preferences: [
          { event: 'export_ready', channel: 'in_app', enabled: true },
        ],
      });
      const created = await service.create(
        businessId,
        userAId,
        { title: 'Should be created', body: 'x' },
        'export_ready',
      );
      expect(created).not.toBeNull();
      expect(created?.title).toBe('Should be created');
    });

    it("a per-staff override takes precedence over the business-wide default, and doesn't affect other staff", async () => {
      await service.setPreferences(businessId, {
        preferences: [
          { event: 'schedule_updated', channel: 'in_app', enabled: true },
        ],
      });
      await service.setPreferences(businessId, {
        userId: userBId,
        preferences: [
          { event: 'schedule_updated', channel: 'in_app', enabled: false },
        ],
      });

      const bEnabled = await service.isEnabled(
        businessId,
        userBId,
        'schedule_updated',
        'in_app',
      );
      const aEnabled = await service.isEnabled(
        businessId,
        userAId,
        'schedule_updated',
        'in_app',
      );
      expect(bEnabled).toBe(false);
      expect(aEnabled).toBe(true);
    });

    it('setPreferences() rejects a userId that is not a real member of this business', async () => {
      await expect(
        service.setPreferences(businessId, {
          userId: 'not-a-real-user-id',
          preferences: [
            { event: 'export_ready', channel: 'in_app', enabled: false },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  describe('assertSelfOrManaging() (UPD-BE-122)', () => {
    it('allows a staff member to manage their own preferences with no capabilities at all', () => {
      expect(() =>
        service.assertSelfOrManaging(userAId, [], userAId),
      ).not.toThrow();
    });

    it('blocks a staff member without manage capability from setting the business-wide default', () => {
      expect(() =>
        service.assertSelfOrManaging(userAId, [], undefined),
      ).toThrow();
    });

    it("blocks a staff member without manage capability from setting another staff member's override", () => {
      expect(() =>
        service.assertSelfOrManaging(userAId, [], userBId),
      ).toThrow();
    });

    it("allows a manager (staff.manage) to set the business default and another staff member's override", () => {
      expect(() =>
        service.assertSelfOrManaging(userAId, ['staff.manage'], undefined),
      ).not.toThrow();
      expect(() =>
        service.assertSelfOrManaging(userAId, ['staff.manage'], userBId),
      ).not.toThrow();
    });
  });
});
