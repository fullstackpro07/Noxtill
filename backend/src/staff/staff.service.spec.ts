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
});
