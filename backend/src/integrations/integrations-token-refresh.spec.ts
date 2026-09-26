import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { IntegrationsService } from './integrations.service';
import { IntegrationAuditService } from './integration-audit.service';
import { TokenCipherService } from './token-cipher.service';
import type { ConnectorRegistry } from './connector-registry';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('IntegrationsService — token renewal and audit (Integrations redesign)', () => {
  let prisma: PrismaService;
  let service: IntegrationsService;
  let cipher: TokenCipherService;
  let businessId: string;
  const refreshToken = jest.fn();
  const connector = {
    authUrl: jest.fn().mockReturnValue('https://provider/authorize'),
    handleCallback: jest.fn(),
    refreshToken,
    sync: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const config = new ConfigService({
    INTEGRATIONS_STATE_SECRET: 'test-state-secret',
    INTEGRATIONS_TOKEN_KEY: Buffer.alloc(32, 9).toString('base64'),
  });

  const store = (
    provider: IntegrationProvider,
    tokens: object,
    status: IntegrationStatus = IntegrationStatus.connected,
  ) =>
    prisma.integration.upsert({
      where: { businessId_provider: { businessId, provider } },
      create: {
        businessId,
        provider,
        status,
        tokens: cipher.encrypt(JSON.stringify(tokens)),
      },
      update: { status, tokens: cipher.encrypt(JSON.stringify(tokens)) },
    });
  const read = async (provider: IntegrationProvider) => {
    const row = await prisma.integration.findUniqueOrThrow({
      where: { businessId_provider: { businessId, provider } },
    });
    return {
      row,
      tokens: row.tokens
        ? (JSON.parse(cipher.decrypt(row.tokens)) as Record<string, unknown>)
        : null,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    cipher = new TokenCipherService(config);
    service = new IntegrationsService(
      tenantPrisma,
      { get: () => connector } as unknown as ConnectorRegistry,
      cipher,
      config,
      new IntegrationAuditService(prisma),
    );
    const business = await prisma.business.create({
      data: { name: 'Token Refresh Biz', slug: `token-refresh-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('leaves a token alone while it still has time left', async () => {
    await store(IntegrationProvider.slack, {
      accessToken: 'fresh',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const tokens = await service.getTokens(
      businessId,
      IntegrationProvider.slack,
    );
    expect(tokens?.accessToken).toBe('fresh');
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('renews an expiring access token with its refresh token and stores the renewed pair', async () => {
    await store(IntegrationProvider.zoom, {
      accessToken: 'stale',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    refreshToken.mockResolvedValue({
      accessToken: 'renewed',
      refreshToken: 'r2',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const tokens = await service.getTokens(
      businessId,
      IntegrationProvider.zoom,
    );
    expect(tokens?.accessToken).toBe('renewed');
    expect((await read(IntegrationProvider.zoom)).tokens).toMatchObject({
      accessToken: 'renewed',
      refreshToken: 'r2',
    });
  });

  it('never tries to renew a token that has no refresh token or no expiry', async () => {
    await store(IntegrationProvider.klaviyo, { accessToken: 'permanent' });
    await store(IntegrationProvider.paypal, {
      accessToken: 'x',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await service.getTokens(businessId, IntegrationProvider.klaviyo);
    await service.getTokens(businessId, IntegrationProvider.paypal);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('when the provider refuses the renewal the connection needs attention instead of failing silently', async () => {
    await store(IntegrationProvider.outlook, {
      accessToken: 'stale',
      refreshToken: 'revoked',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    refreshToken.mockRejectedValue(new Error('invalid_grant'));
    const tokens = await service.getTokens(
      businessId,
      IntegrationProvider.outlook,
    );
    expect(tokens?.accessToken).toBe('stale');
    expect((await read(IntegrationProvider.outlook)).row.status).toBe(
      IntegrationStatus.needs_attention,
    );
  });

  it('turns a credential the provider rejects into a clear 400 the merchant can act on, and audits the failed attempt', async () => {
    connector.authUrl.mockReturnValueOnce(null);
    connector.handleCallback.mockRejectedValueOnce(
      new Error('Request failed with status code 401'),
    );
    await expect(
      service.connect(
        businessId,
        IntegrationProvider.mailchimp,
        { clientId: 'x', clientSecret: 'y' },
        'user-42',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'INTEGRATION_CONNECT_FAILED',
        message: expect.stringContaining('status code 401'),
      },
    });
    const failed = await prisma.auditLog.findFirst({
      where: {
        businessId,
        entityId: 'mailchimp',
        action: 'integration.connect_failed',
      },
    });
    expect(failed?.actorUserId).toBe('user-42');
    // Nothing was stored for a connection that never succeeded.
    expect(
      await prisma.integration.count({
        where: {
          businessId,
          provider: IntegrationProvider.mailchimp,
          status: IntegrationStatus.connected,
        },
      }),
    ).toBe(0);
  });

  it('records who connected and who disconnected in the integration audit trail', async () => {
    connector.authUrl.mockReturnValueOnce(null);
    connector.handleCallback.mockResolvedValue({ accessToken: 'k' });
    await service.connect(
      businessId,
      IntegrationProvider.klaviyo,
      { privateApiKey: 'pk' },
      'user-42',
    );
    await service.disconnect(
      businessId,
      IntegrationProvider.klaviyo,
      'user-42',
    );
    const rows = await prisma.auditLog.findMany({
      where: { businessId, entity: 'Integration', entityId: 'klaviyo' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual([
      'integration.connected',
      'integration.disconnected',
    ]);
    expect(rows.every((r) => r.actorUserId === 'user-42')).toBe(true);
    // Disconnecting also clears a pause, so a later reconnect starts clean.
    expect((await read(IntegrationProvider.klaviyo)).row.pausedAt).toBeNull();
  });
});
