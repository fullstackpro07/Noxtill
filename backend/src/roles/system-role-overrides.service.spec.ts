import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SystemRoleOverridesService } from './system-role-overrides.service';
import { AppException } from '../common/filters/app.exception';
import {
  CAPABILITIES,
  SYSTEM_ROLE_CAPABILITIES,
} from '../common/capabilities/capabilities.constants';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
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

describe('SystemRoleOverridesService (UPD-BE-STAFF-01)', () => {
  let prisma: PrismaService;
  let capabilities: CapabilitiesService;
  let service: SystemRoleOverridesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    capabilities = new CapabilitiesService(prisma);

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    service = new SystemRoleOverridesService(tenantPrisma, audit);

    const business = await prisma.business.create({
      data: {
        name: 'System Role Overrides Test Biz',
        slug: `system-role-overrides-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('lists both overridable roles at their system default when nothing has been overridden yet', async () => {
    const list = await service.list(businessId);
    expect(list).toEqual([
      {
        role: Role.manager,
        capabilities: SYSTEM_ROLE_CAPABILITIES[Role.manager],
        isOverridden: false,
      },
      {
        role: Role.staff,
        capabilities: SYSTEM_ROLE_CAPABILITIES[Role.staff],
        isOverridden: false,
      },
    ]);
  });

  it('rejects an update targeting the owner role', async () => {
    await expect(
      service.update(businessId, 'owner', [CAPABILITIES.BOOKINGS_MANAGE]),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an update targeting an unknown role string', async () => {
    await expect(
      service.update(businessId, 'not-a-role', [CAPABILITIES.BOOKINGS_MANAGE]),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an update containing an unknown capability key', async () => {
    await expect(
      service.update(businessId, 'staff', ['not.a.real.capability']),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('saves a real override, and CapabilitiesService.resolve honors it immediately', async () => {
    const result = await service.update(businessId, 'staff', [
      CAPABILITIES.BOOKINGS_MANAGE,
    ]);
    expect(result).toEqual({
      role: Role.staff,
      capabilities: [CAPABILITIES.BOOKINGS_MANAGE],
      isOverridden: true,
    });

    const resolved = await capabilities.resolve({
      businessId,
      role: Role.staff,
      customRoleId: null,
    });
    expect(resolved).toEqual([CAPABILITIES.BOOKINGS_MANAGE]);

    const list = await service.list(businessId);
    expect(list.find((r) => r.role === Role.staff)).toEqual({
      role: Role.staff,
      capabilities: [CAPABILITIES.BOOKINGS_MANAGE],
      isOverridden: true,
    });
  });

  it('writes an audit log entry with before/after on update', async () => {
    const before = await prisma.auditLog.count({
      where: { businessId, entity: 'role_capability_override' },
    });
    await service.update(businessId, 'staff', [CAPABILITIES.CREDIT_MANAGE]);
    const after = await prisma.auditLog.count({
      where: { businessId, entity: 'role_capability_override' },
    });
    expect(after).toBe(before + 1);
  });

  it('resets an override back to the system default and CapabilitiesService reflects it', async () => {
    const result = await service.reset(businessId, 'staff');
    expect(result).toEqual({
      role: Role.staff,
      capabilities: SYSTEM_ROLE_CAPABILITIES[Role.staff],
      isOverridden: false,
    });

    const resolved = await capabilities.resolve({
      businessId,
      role: Role.staff,
      customRoleId: null,
    });
    expect(resolved).toEqual(SYSTEM_ROLE_CAPABILITIES[Role.staff]);
  });

  it('resetting a role with no override is a harmless no-op', async () => {
    const result = await service.reset(businessId, 'manager');
    expect(result).toEqual({
      role: Role.manager,
      capabilities: SYSTEM_ROLE_CAPABILITIES[Role.manager],
      isOverridden: false,
    });
  });
});
