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
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    service = new NotificationsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Notifications Test Biz', slug: `notifications-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const userA = await prisma.user.create({
      data: { name: 'User A', email: `notif-a-${Date.now()}@example.com`, passwordHash: 'x' },
    });
    userAId = userA.id;
    const userB = await prisma.user.create({
      data: { name: 'User B', email: `notif-b-${Date.now()}@example.com`, passwordHash: 'x' },
    });
    userBId = userB.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { businessId } });
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
    expect(created.userId).toBe(userAId);
    expect(created.read).toBe(false);
  });

  it("list() only returns the calling user's own notifications, not another user's", async () => {
    await service.create(businessId, userBId, { title: 'For B only', body: 'x' });

    const listA = await service.list(userAId);
    const listB = await service.list(userBId);

    expect(listA.some((n) => n.title === 'For B only')).toBe(false);
    expect(listB.some((n) => n.title === 'For B only')).toBe(true);
  });

  it('markRead() flips the read flag for the owning user', async () => {
    const created = await service.create(businessId, userAId, { title: 'Mark me', body: 'x' });
    const updated = await service.markRead(userAId, created.id);
    expect(updated.read).toBe(true);
  });

  it("markRead() rejects a user trying to mark another user's notification", async () => {
    const created = await service.create(businessId, userAId, { title: 'Not yours', body: 'x' });
    await expect(service.markRead(userBId, created.id)).rejects.toThrow();
  });
});
