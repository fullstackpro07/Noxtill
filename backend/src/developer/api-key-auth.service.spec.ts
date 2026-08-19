import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ClsService } from 'nestjs-cls';
import { ApiKeyService } from './api-key.service';
import { ApiKeyAuthService } from './api-key-auth.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Role } from '@prisma/client';

class FakeClsService {
  get<T>(): T {
    return undefined as unknown as T;
  }
  set() {
    /* noop */
  }
}

describe('ApiKeyAuthService (UPD-BE-081)', () => {
  let prisma: PrismaService;
  let keyService: ApiKeyService;
  let authService: ApiKeyAuthService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      new FakeClsService() as unknown as ClsService,
    );
    keyService = new ApiKeyService(tenantPrisma);
    authService = new ApiKeyAuthService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'Api Key Auth Test Biz',
        slug: `api-key-auth-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('authenticates a real key, resolving businessId and the exact scopes it was created with', async () => {
    const created = await keyService.create(businessId, {
      name: 'Real key',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE, CAPABILITIES.ADS_MANAGE],
    });

    const user = await authService.authenticate(created.key);
    expect(user).not.toBeNull();
    expect(user?.businessId).toBe(businessId);
    expect(user?.role).toBe(Role.staff);
    expect(user?.capabilities).toEqual([
      CAPABILITIES.INTEGRATIONS_MANAGE,
      CAPABILITIES.ADS_MANAGE,
    ]);

    // `lastUsedAt` is updated fire-and-forget (never awaited by `authenticate()`, by design) — give it a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const refreshed = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(refreshed.lastUsedAt).not.toBeNull();
  });

  it('rejects an unknown key', async () => {
    const user = await authService.authenticate('ntk_totally_made_up');
    expect(user).toBeNull();
  });

  it('rejects a real but revoked key', async () => {
    const created = await keyService.create(businessId, {
      name: 'Will be revoked',
      scopes: [CAPABILITIES.ADS_MANAGE],
    });
    await keyService.revoke(created.id);

    const user = await authService.authenticate(created.key);
    expect(user).toBeNull();
  });
});
