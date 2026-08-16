import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { StaffService } from './staff.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('StaffService (BE-056)', () => {
  let prisma: PrismaService;
  let service: StaffService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new StaffService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Staff Test Biz', slug: `staff-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('invites a brand-new person, creating a User and returning a temp password', async () => {
    const result = await service.create(businessId, {
      name: 'Nora Staff',
      email: `nora-${Date.now()}@example.com`,
      role: 'staff',
      commissionRule: { type: 'percent', value: 5 },
    });

    expect(result.role).toBe('staff');
    expect(result.tempPassword).toBeDefined();
    expect(result.user.name).toBe('Nora Staff');
  });

  it('rejects inviting the same person to the same business twice', async () => {
    const email = `dupe-${Date.now()}@example.com`;
    await service.create(businessId, { name: 'Dupe', email, role: 'staff' });

    await expect(
      service.create(businessId, { name: 'Dupe', email, role: 'manager' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('updates role and commission rule', async () => {
    const created = await service.create(businessId, {
      name: 'Updatable',
      email: `updatable-${Date.now()}@example.com`,
      role: 'staff',
    });

    const updated = await service.update(created.id, {
      role: 'manager',
      commissionRule: { type: 'percent', value: 10 },
    });
    expect(updated.role).toBe('manager');
  });

  it('lists staff members', async () => {
    const list = await service.list();
    expect(list.length).toBeGreaterThan(0);
  });

  it('includes the owner in the list (booking calendar needs a solo owner-operator to appear)', async () => {
    const ownerUser = await prisma.user.create({
      data: {
        name: 'Owner Person',
        email: `owner-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    const ownerLink = await prisma.businessUser.create({
      data: { businessId, userId: ownerUser.id, role: 'owner' },
    });

    const list = await service.list();
    expect(list.find((m) => m.id === ownerLink.id)?.role).toBe('owner');
  });

  it('removes a staff member', async () => {
    const created = await service.create(businessId, {
      name: 'Removable',
      email: `removable-${Date.now()}@example.com`,
      role: 'staff',
    });

    const result = await service.remove(created.id);
    expect(result.success).toBe(true);

    const list = await service.list();
    expect(list.find((m) => m.id === created.id)).toBeUndefined();
  });

  describe('inbox()', () => {
    it('composes upcoming appointments, unresolved complaints, and low-stock alerts', async () => {
      const staffMember = await service.create(businessId, {
        name: 'Inbox Staffer',
        email: `inbox-staffer-${Date.now()}@example.com`,
        role: 'staff',
      });
      const customer = await prisma.customer.create({
        data: { businessId, phone: `+1${Date.now()}`, name: 'Inbox Customer' },
      });
      const svc = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Inbox Service',
          durationMin: 30,
        },
      });
      const lowStockProduct = await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Low Stock Widget',
          stockQty: 1,
          lowStockThreshold: 5,
        },
      });
      const appointment = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: svc.id,
          customerId: customer.id,
          staffUserId: staffMember.id,
          startsAt: new Date(Date.now() + 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          status: 'confirmed',
        },
      });
      const feedback = await prisma.privateFeedback.create({
        data: {
          businessId,
          stars: 2,
          message: 'Needs follow-up',
          status: 'assigned',
          assignedTo: staffMember.id,
        },
      });
      // A resolved complaint and a completed appointment must NOT show up.
      await prisma.privateFeedback.create({
        data: {
          businessId,
          stars: 1,
          status: 'resolved',
          assignedTo: staffMember.id,
        },
      });
      const completedAppt = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: svc.id,
          customerId: customer.id,
          staffUserId: staffMember.id,
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
          endsAt: new Date(Date.now() - 30 * 60 * 1000),
          status: 'completed',
        },
      });

      const tasks = await service.inbox();

      const apptTask = tasks.find((t) => t.id === appointment.id);
      expect(apptTask).toMatchObject({
        type: 'appointment',
        title: 'Inbox Customer',
        detail: 'Inbox Service',
        assigneeStaffId: staffMember.id,
      });

      const feedbackTask = tasks.find((t) => t.id === feedback.id);
      expect(feedbackTask).toMatchObject({
        type: 'complaint',
        title: '2★ feedback',
        detail: 'Needs follow-up',
        assigneeStaffId: staffMember.id,
      });

      const restockTask = tasks.find((t) => t.id === lowStockProduct.id);
      expect(restockTask).toMatchObject({
        type: 'restock',
        title: 'Low Stock Widget',
        assigneeStaffId: null,
      });

      expect(tasks.find((t) => t.id === completedAppt.id)).toBeUndefined();

      await prisma.appointment.deleteMany({ where: { businessId } });
      await prisma.privateFeedback.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
    });
  });
});
