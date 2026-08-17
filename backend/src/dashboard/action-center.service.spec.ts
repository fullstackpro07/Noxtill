import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActionCenterService } from './action-center.service';
import { Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ActionCenterService (UPD-BE-004)', () => {
  let prisma: PrismaService;
  let service: ActionCenterService;
  let businessId: string;
  let assignedStaffId: string;
  let otherStaffId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    service = new ActionCenterService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Action Center Test Biz', slug: `action-center-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const [ownerUser, staffUser] = await Promise.all([
      prisma.user.create({
        data: { name: 'Owner', email: `owner-${Date.now()}@example.com`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { name: 'Staff', email: `staff-${Date.now()}@example.com`, passwordHash: 'x' },
      }),
    ]);
    const [assignedStaff, otherStaff] = await Promise.all([
      prisma.businessUser.create({
        data: { businessId, userId: staffUser.id, role: 'staff' },
      }),
      prisma.businessUser.create({
        data: { businessId, userId: ownerUser.id, role: 'staff' },
      }),
    ]);
    assignedStaffId = assignedStaff.id;
    otherStaffId = otherStaff.id;
  });

  afterAll(async () => {
    await prisma.actionItemState.deleteMany({ where: { businessId } });
    await prisma.privateFeedback.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('returns an empty queue for a business with no signal', async () => {
    const result = await service.list(businessId, Role.owner, null, {});
    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({ urgent: 0, open: 0, completedThisWeek: 0 });
  });

  it('surfaces a real low-stock product as an item, urgent when out of stock', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Zero Stock Widget',
        costPrice: 5,
        sellingPrice: 10,
        stockQty: 0,
        lowStockThreshold: 5,
        active: true,
      },
    });

    const result = await service.list(businessId, Role.owner, null, {});
    const item = result.items.find((i) => i.type === 'low_stock');
    expect(item).toBeDefined();
    expect(item?.priority).toBe('urgent');
    expect(item?.id).toBe(`low_stock:${product.id}`);
  });

  it('surfaces an open (not resolved) complaint, and excludes resolved ones', async () => {
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Complainer', phone: '+10000000020' },
    });
    const openFeedback = await prisma.privateFeedback.create({
      data: { businessId, customerId: customer.id, stars: 1, status: 'open' },
    });
    await prisma.privateFeedback.create({
      data: { businessId, customerId: customer.id, stars: 1, status: 'resolved' },
    });

    const result = await service.list(businessId, Role.owner, null, {});
    const complaintItems = result.items.filter((i) => i.type === 'complaint');
    expect(complaintItems).toHaveLength(1);
    expect(complaintItems[0].id).toBe(`complaint:${openFeedback.id}`);
    expect(complaintItems[0].priority).toBe('urgent'); // 1-star
  });

  it('surfaces a real overdue debtor only once past the notable-days threshold', async () => {
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Debtor Customer', phone: '+10000000021' },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId: customer.id,
        kind: 'credit',
        amount: 150,
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await service.list(businessId, Role.owner, null, {});
    const creditItem = result.items.find((i) => i.type === 'overdue_credit');
    expect(creditItem).toBeDefined();
    expect(creditItem?.title).toContain('Debtor Customer');
  });

  it('surfaces an unreplied external review and excludes replied ones', async () => {
    const unreplied = await prisma.externalReview.create({
      data: { businessId, platform: 'google', externalId: 'r-unreplied', stars: 2 },
    });
    await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: 'r-replied',
        stars: 5,
        replyText: 'Thanks!',
        repliedAt: new Date(),
      },
    });

    const result = await service.list(businessId, Role.owner, null, {});
    const reviewItems = result.items.filter((i) => i.type === 'unreplied_review');
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0].id).toBe(`unreplied_review:${unreplied.id}`);
  });

  it('filters by type and priority query params', async () => {
    const stockOnly = await service.list(businessId, Role.owner, null, { type: 'low_stock' });
    expect(stockOnly.items.every((i) => i.type === 'low_stock')).toBe(true);

    const urgentOnly = await service.list(businessId, Role.owner, null, { priority: 'urgent' });
    expect(urgentOnly.items.every((i) => i.priority === 'urgent')).toBe(true);
  });

  describe('staff RBAC', () => {
    it('shows a staff caller only complaints assigned to them, nothing else', async () => {
      const customer = await prisma.customer.create({
        data: { businessId, name: 'Assigned Complainer', phone: '+10000000022' },
      });
      await prisma.privateFeedback.create({
        data: {
          businessId,
          customerId: customer.id,
          stars: 1,
          status: 'assigned',
          assignedTo: assignedStaffId,
        },
      });

      const result = await service.list(businessId, Role.staff, assignedStaffId, {});
      expect(result.items.every((i) => i.type === 'complaint')).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);

      const otherResult = await service.list(businessId, Role.staff, otherStaffId, {});
      expect(otherResult.items.every((i) => i.type === 'complaint')).toBe(true);
      // otherStaffId has no complaints assigned to them specifically.
      const assignedToOther = otherResult.items.filter((i) =>
        i.title.includes('Assigned Complainer'),
      );
      expect(assignedToOther).toHaveLength(0);
    });
  });

  describe('complete/dismiss/snooze', () => {
    it('a completed item never resurfaces, and counts toward completedThisWeek', async () => {
      const before = await service.list(businessId, Role.owner, null, { type: 'low_stock' });
      const target = before.items[0];
      expect(target).toBeDefined();

      await service.complete(businessId, target.id);

      const after = await service.list(businessId, Role.owner, null, { type: 'low_stock' });
      expect(after.items.find((i) => i.id === target.id)).toBeUndefined();
      expect(after.counts.completedThisWeek).toBeGreaterThan(0);
    });

    it('a dismissed item never resurfaces', async () => {
      const before = await service.list(businessId, Role.owner, null, { type: 'overdue_credit' });
      const target = before.items[0];
      expect(target).toBeDefined();

      await service.dismiss(businessId, target.id);

      const after = await service.list(businessId, Role.owner, null, { type: 'overdue_credit' });
      expect(after.items.find((i) => i.id === target.id)).toBeUndefined();
    });

    it('a snoozed item is hidden until its snooze expires, then reappears', async () => {
      const before = await service.list(businessId, Role.owner, null, { type: 'unreplied_review' });
      const target = before.items[0];
      expect(target).toBeDefined();

      await service.snooze(businessId, target.id, { duration: '1h' });

      const duringSnooze = await service.list(businessId, Role.owner, null, {
        type: 'unreplied_review',
      });
      expect(duringSnooze.items.find((i) => i.id === target.id)).toBeUndefined();

      // Force the snooze into the past to simulate expiry without waiting a real hour.
      const [type, entityId] = target.id.split(':');
      await prisma.actionItemState.update({
        where: { businessId_type_entityId: { businessId, type: type as never, entityId } },
        data: { snoozedUntil: new Date(Date.now() - 1000) },
      });

      const afterExpiry = await service.list(businessId, Role.owner, null, {
        type: 'unreplied_review',
      });
      expect(afterExpiry.items.find((i) => i.id === target.id)).toBeDefined();
    });

    it('throws for an id with a type that does not exist', async () => {
      await expect(
        service.complete(businessId, 'not_a_real_type:00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow();
    });
  });
});
