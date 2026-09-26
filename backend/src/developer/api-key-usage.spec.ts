import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { ApiKeyService } from './api-key.service';
import {
  ApiKeyAuthService,
  ApiKeyRateLimitedException,
} from './api-key-auth.service';
import { DeveloperOverviewService } from './developer-overview.service';
import { API_KEY_HOURLY_LIMIT } from './api-key.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('API key usage, rate limit and overview (Integrations redesign)', () => {
  let prisma: PrismaService;
  let keys: ApiKeyService;
  let auth: ApiKeyAuthService;
  let overview: DeveloperOverviewService;
  let businessId: string;
  const hourStart = () =>
    new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    keys = new ApiKeyService(tenantPrisma);
    auth = new ApiKeyAuthService(prisma);
    overview = new DeveloperOverviewService(tenantPrisma);
    const business = await prisma.business.create({
      data: { name: 'Api Key Usage Biz', slug: `api-key-usage-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.apiKeyUsageHour.deleteMany({ where: { businessId } });
    await prisma.apiKey.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('counts every authenticated request in the current hour bucket', async () => {
    const created = await keys.create(businessId, {
      name: 'Counted',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE],
    });
    await auth.authenticate(created.key);
    await auth.authenticate(created.key);
    await auth.authenticate(created.key);
    const row = await prisma.apiKeyUsageHour.findUniqueOrThrow({
      where: {
        apiKeyId_bucketStart: {
          apiKeyId: created.id,
          bucketStart: hourStart(),
        },
      },
    });
    expect(row.count).toBe(3);
  });

  it('does not count a request made with an unknown or revoked key', async () => {
    expect(await auth.authenticate('ntk_not-a-real-key')).toBeNull();
    const created = await keys.create(businessId, {
      name: 'Soon revoked',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE],
    });
    await keys.revoke(created.id);
    expect(await auth.authenticate(created.key)).toBeNull();
    expect(
      await prisma.apiKeyUsageHour.count({ where: { apiKeyId: created.id } }),
    ).toBe(0);
  });

  it('answers 429 with a Retry-After once the key has used its hourly allowance', async () => {
    const created = await keys.create(businessId, {
      name: 'Busy',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE],
    });
    await prisma.apiKeyUsageHour.create({
      data: {
        apiKeyId: created.id,
        businessId,
        bucketStart: hourStart(),
        count: API_KEY_HOURLY_LIMIT,
      },
    });
    await expect(auth.authenticate(created.key)).rejects.toBeInstanceOf(
      ApiKeyRateLimitedException,
    );
    await auth
      .authenticate(created.key)
      .catch((error: ApiKeyRateLimitedException) => {
        expect(error.getStatus()).toBe(429);
        expect(error.retryAfterSeconds).toBeGreaterThan(0);
        expect(error.retryAfterSeconds).toBeLessThanOrEqual(3600);
      });
  });

  it('the limit is per key — a busy key does not throttle another one', async () => {
    const other = await keys.create(businessId, {
      name: 'Quiet',
      scopes: [CAPABILITIES.INTEGRATIONS_MANAGE],
    });
    await expect(auth.authenticate(other.key)).resolves.not.toBeNull();
  });

  it('refuses to grant a destructive or admin scope to a key', async () => {
    await expect(
      keys.create(businessId, {
        name: 'Dangerous',
        scopes: [CAPABILITIES.CUSTOMERS_ERASE],
      }),
    ).rejects.toMatchObject({
      response: { code: 'API_KEY_SCOPE_FORBIDDEN' },
    });
    const offered = overview.scopes().map((s) => s.key);
    expect(offered).toContain(CAPABILITIES.INTEGRATIONS_MANAGE);
    expect(offered).not.toContain(CAPABILITIES.CUSTOMERS_ERASE);
    expect(offered).not.toContain(CAPABILITIES.ROLES_MANAGE);
    expect(offered).not.toContain(CAPABILITIES.BILLING_MANAGE);
  });

  it('the Developer overview reports real request counts, headroom and per-key usage', async () => {
    const data = await overview.overview(businessId);
    expect(data.hourlyLimit).toBe(API_KEY_HOURLY_LIMIT);
    expect(data.kpis.requestsMonth).toBeGreaterThanOrEqual(
      API_KEY_HOURLY_LIMIT + 3,
    );
    // The busiest key sits at its limit this hour, so there is no headroom left.
    expect(data.kpis.busiestKeyThisHour).toBeGreaterThanOrEqual(
      API_KEY_HOURLY_LIMIT,
    );
    expect(data.kpis.headroomPct).toBe(0);
    const counted = data.keys.find((k) => k.name === 'Counted');
    expect(counted?.requestsMonth).toBe(3);
    expect(data.days).toHaveLength(14);
    expect(
      data.days.reduce((n, d) => n + d.requests, 0),
    ).toBeGreaterThanOrEqual(3);
  });
});
