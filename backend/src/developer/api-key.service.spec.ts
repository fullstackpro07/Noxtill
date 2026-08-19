import { ClsService } from 'nestjs-cls';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ApiKeyService } from './api-key.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ApiKeyService (UPD-BE-081)', () => {
  let prisma: PrismaService;
  let service: ApiKeyService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ApiKeyService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Api Key Test Biz', slug: `api-key-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('generates a real key, returns the plaintext exactly once, and never persists it in the clear', async () => {
    const created = await service.create(businessId, {
      name: 'CI integration',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE],
    });
    expect(created.key).toMatch(/^ntk_[0-9a-f]{48}$/);
    expect(created.keyPrefix).toBe(created.key.slice(0, 12));

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.keyHash).toBe(
      createHash('sha256').update(created.key).digest('hex'),
    );
    expect(row.keyHash).not.toBe(created.key);
  });

  it('list() never exposes the key hash', async () => {
    const rows = await service.list();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        (row as unknown as Record<string, unknown>).keyHash,
      ).toBeUndefined();
    }
  });

  it('revoke() sets a real revokedAt timestamp and rejects revoking a non-existent key', async () => {
    const created = await service.create(businessId, {
      name: 'Revoke me',
      scopes: [CAPABILITIES.ADS_MANAGE],
    });
    const revoked = await service.revoke(created.id);
    expect(revoked.revokedAt).not.toBeNull();
    await expect(service.revoke('no-such-id')).rejects.toThrow();
  });
});
