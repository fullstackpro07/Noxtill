import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { IntegrationsService } from './integrations.service';
import { TokenCipherService } from './token-cipher.service';
import { ConnectorRegistry } from './connector-registry';
import { AppException } from '../common/filters/app.exception';
import { IntegrationProvider, IntegrationStatus } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('IntegrationsService (BE-082)', () => {
  let prisma: PrismaService;
  let service: IntegrationsService;
  let businessId: string;
  const config = new ConfigService({
    INTEGRATIONS_STATE_SECRET: 'test-state-secret',
    INTEGRATIONS_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
  const oauthConnector = {
    provider: IntegrationProvider.gmb,
    authUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?fake=1'),
    handleCallback: jest.fn(),
    refreshToken: jest.fn(),
    sync: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const emailConnector = {
    provider: IntegrationProvider.email,
    authUrl: jest.fn().mockReturnValue(null),
    handleCallback: jest.fn(),
    refreshToken: jest.fn(),
    sync: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const registry = {
    get: jest.fn((provider: IntegrationProvider) =>
      provider === IntegrationProvider.email ? emailConnector : oauthConnector,
    ),
    all: jest.fn().mockReturnValue(Object.values(IntegrationProvider)),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new IntegrationsService(
      tenantPrisma,
      registry as unknown as ConnectorRegistry,
      new TokenCipherService(config),
      config,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Integrations Test Biz',
        slug: `integrations-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    oauthConnector.handleCallback.mockClear();
    oauthConnector.disconnect.mockClear();
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('list() synthesizes not_connected rows for every provider with no real Integration row yet', async () => {
    const rows = await service.list(businessId);
    expect(rows).toHaveLength(Object.values(IntegrationProvider).length);
    expect(
      rows.every((r) => r.status === IntegrationStatus.not_connected),
    ).toBe(true);
  });

  it('connect() returns a real authUrl for an OAuth provider without writing to the database', async () => {
    const result = await service.connect(businessId, IntegrationProvider.gmb);
    expect(result.authUrl).toContain('accounts.google.com');
    const row = await prisma.integration.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect(row).toBeNull();
  });

  it('connect() on the non-OAuth email provider connects immediately, no redirect', async () => {
    const result = await service.connect(businessId, IntegrationProvider.email);
    expect(result).toEqual({ connected: true });
    const row = await prisma.integration.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.email,
        },
      },
    });
    expect(row?.status).toBe(IntegrationStatus.connected);
  });

  it('handleCallback() verifies state, exchanges the code, and stores tokens encrypted', async () => {
    oauthConnector.handleCallback.mockResolvedValue({
      accessToken: 'real-access-token',
      refreshToken: 'real-refresh',
    });
    await service.connect(businessId, IntegrationProvider.gmb);
    const state = lastCapturedState();

    const result = await service.handleCallback(
      IntegrationProvider.gmb,
      'auth-code',
      state,
    );
    expect(result).toEqual({ businessId, ok: true });

    const row = await prisma.integration.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect(row?.status).toBe(IntegrationStatus.connected);
    expect(row?.tokens).not.toContain('real-access-token'); // encrypted at rest

    const tokens = await service.getTokens(businessId, IntegrationProvider.gmb);
    expect(tokens).toEqual({
      accessToken: 'real-access-token',
      refreshToken: 'real-refresh',
    });
  });

  it('handleCallback() lands the integration in needs_attention (not a thrown error) when the real token exchange fails', async () => {
    oauthConnector.handleCallback.mockRejectedValue(
      new Error('invalid_client'),
    );
    await service.connect(businessId, IntegrationProvider.gmb);
    const state = lastCapturedState();

    const result = await service.handleCallback(
      IntegrationProvider.gmb,
      'auth-code',
      state,
    );
    expect(result.ok).toBe(false);

    const row = await prisma.integration.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect(row?.status).toBe(IntegrationStatus.needs_attention);
  });

  it('handleCallback() rejects a tampered or forged state param', async () => {
    await expect(
      service.handleCallback(
        IntegrationProvider.gmb,
        'auth-code',
        'forged.state',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('disconnect() calls the connector and clears the stored tokens', async () => {
    await service.disconnect(businessId, IntegrationProvider.gmb);

    expect(oauthConnector.disconnect).toHaveBeenCalled();
    const row = await prisma.integration.findUnique({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect(row?.status).toBe(IntegrationStatus.not_connected);
    expect(row?.tokens).toBeNull();
  });

  /** `connect()` passes the real signed state string as `authUrl(state)`'s argument — the mock records it even though its return value is canned. */
  function lastCapturedState(): string {
    const calls = oauthConnector.authUrl.mock.calls as [string][];
    const last = calls[calls.length - 1];
    return last[0];
  }
});
