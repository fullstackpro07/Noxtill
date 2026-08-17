import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CustomRolesService } from './custom-roles.service';
import { AppException } from '../common/filters/app.exception';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Role } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CustomRolesService (UPD-BE-035)', () => {
  let prisma: PrismaService;
  let service: CustomRolesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CustomRolesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Custom Roles Test Biz',
        slug: `custom-roles-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.customRole.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real custom role with a real capability subset', async () => {
    const role = await service.create(businessId, {
      name: 'Front Desk',
      capabilities: [CAPABILITIES.RETURNS_APPROVE],
    });
    expect(role.name).toBe('Front Desk');
    expect(role.capabilities).toEqual([CAPABILITIES.RETURNS_APPROVE]);

    const list = await service.list();
    expect(list.some((r) => r.id === role.id)).toBe(true);

    const found = await service.findOne(role.id);
    expect(found.id).toBe(role.id);
  });

  it('rejects an unknown capability key on create and on update', async () => {
    await expect(
      service.create(businessId, {
        name: 'Bogus Role',
        capabilities: ['not.a.real.capability'],
      }),
    ).rejects.toBeInstanceOf(AppException);

    const role = await service.create(businessId, {
      name: 'Cashier',
      capabilities: [CAPABILITIES.COUPONS_MANAGE],
    });
    await expect(
      service.update(role.id, { capabilities: ['also.not.real'] }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a duplicate role name for the same business', async () => {
    await service.create(businessId, {
      name: 'Duplicate Name',
      capabilities: [],
    });
    await expect(
      service.create(businessId, {
        name: 'Duplicate Name',
        capabilities: [CAPABILITIES.PRICING_MANAGE],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('updates a real role and reflects the change', async () => {
    const role = await service.create(businessId, {
      name: 'Editable Role',
      capabilities: [CAPABILITIES.PRICING_MANAGE],
    });
    const updated = await service.update(role.id, {
      name: 'Renamed Role',
      capabilities: [CAPABILITIES.PRICING_MANAGE, CAPABILITIES.COUPONS_MANAGE],
    });
    expect(updated.name).toBe('Renamed Role');
    expect(updated.capabilities).toHaveLength(2);
  });

  it('rejects deleting a role still assigned to a real staff member, then allows it once unassigned', async () => {
    const role = await service.create(businessId, {
      name: 'Assigned Role',
      capabilities: [CAPABILITIES.RETURNS_APPROVE],
    });
    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}`,
        name: 'Custom Role Staff',
        passwordHash: 'test-hash',
      },
    });
    const businessUser = await prisma.businessUser.create({
      data: {
        businessId,
        userId: user.id,
        role: Role.staff,
        customRoleId: role.id,
      },
    });

    await expect(service.remove(role.id)).rejects.toBeInstanceOf(AppException);

    await prisma.businessUser.update({
      where: { id: businessUser.id },
      data: { customRoleId: null },
    });
    await service.remove(role.id);
    await expect(service.findOne(role.id)).rejects.toThrow();

    await prisma.businessUser.delete({ where: { id: businessUser.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects operations on an unknown role', async () => {
    await expect(service.findOne('not-a-real-id')).rejects.toThrow();
  });
});
