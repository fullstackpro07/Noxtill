import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SocialAccountsService } from './social-accounts.service';
import { TokenCipherService } from '../integrations/token-cipher.service';
import { AppException } from '../common/filters/app.exception';
import type { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { SocialAccountStatus, SocialPlatform } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SocialAccountsService (UPD-BE-045)', () => {
  let prisma: PrismaService;
  let service: SocialAccountsService;
  let businessId: string;

  const oauthConnector = {
    provider: SocialPlatform.facebook,
    authUrl: jest
      .fn<string, [string]>()
      .mockReturnValue('https://facebook.com/oauth?fake=1'),
    handleCallback: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const tokenConnector = {
    provider: SocialPlatform.telegram,
    authUrl: jest.fn().mockReturnValue(null),
    handleCallback: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const registry = {
    get: jest.fn((platform: SocialPlatform) =>
      platform === SocialPlatform.telegram ? tokenConnector : oauthConnector,
    ),
    all: jest.fn().mockReturnValue(Object.values(SocialPlatform)),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const config = new ConfigService({
      INTEGRATIONS_STATE_SECRET: 'test-secret',
      INTEGRATIONS_TOKEN_KEY: Buffer.alloc(32, 3).toString('base64'),
    });
    service = new SocialAccountsService(
      tenantPrisma,
      registry as unknown as SocialConnectorRegistry,
      new TokenCipherService(config),
      config,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Social Accounts Test Biz',
        slug: `social-accounts-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.socialAccount.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('list() synthesizes not_connected rows for every platform with no real row yet', async () => {
    const rows = await service.list(businessId);
    expect(rows).toHaveLength(Object.values(SocialPlatform).length);
    expect(
      rows.every((r) => r.status === SocialAccountStatus.not_connected),
    ).toBe(true);
  });

  it('connect() returns a real authUrl for an OAuth platform', () => {
    const result = service.connect(businessId, SocialPlatform.facebook);
    expect(result.authUrl).toContain('facebook.com');
  });

  it('connect() returns requiresToken for a token-based platform, never auto-connecting with nothing', async () => {
    const result = service.connect(businessId, SocialPlatform.telegram);
    expect(result).toEqual({ requiresToken: true });
    const row = await prisma.socialAccount.findUnique({
      where: {
        businessId_platform: { businessId, platform: SocialPlatform.telegram },
      },
    });
    expect(row).toBeNull();
  });

  it('connectWithToken() rejects an OAuth platform — must use the redirect flow instead', async () => {
    await expect(
      service.connectWithToken(
        businessId,
        SocialPlatform.facebook,
        'some-token',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('connectWithToken() verifies the real credential, stores real tokens, and returns the real account identity', async () => {
    tokenConnector.handleCallback.mockResolvedValue({
      accessToken: 'real-bot-token',
      externalAccountId: 'bot-123',
      externalAccountName: 'MyBusinessBot',
    });

    const result = await service.connectWithToken(
      businessId,
      SocialPlatform.telegram,
      'real-bot-token',
    );
    expect(result).toEqual({ connected: true });

    const row = await prisma.socialAccount.findUnique({
      where: {
        businessId_platform: { businessId, platform: SocialPlatform.telegram },
      },
    });
    expect(row?.status).toBe(SocialAccountStatus.connected);
    expect(row?.tokens).not.toContain('real-bot-token'); // encrypted at rest
    expect(row?.externalAccountId).toBe('bot-123');

    const tokens = await service.getTokens(businessId, SocialPlatform.telegram);
    expect(tokens).toEqual({
      accessToken: 'real-bot-token',
      externalAccountId: 'bot-123',
      externalAccountName: 'MyBusinessBot',
    });
  });

  it('connectWithToken() rejects an invalid credential with a clear error, storing nothing', async () => {
    tokenConnector.handleCallback.mockRejectedValue(
      new Error('401 Unauthorized'),
    );
    await expect(
      service.connectWithToken(
        businessId,
        SocialPlatform.telegram,
        'bad-token',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('handleCallback() verifies state, exchanges the code, and stores tokens encrypted', async () => {
    oauthConnector.handleCallback.mockResolvedValue({
      accessToken: 'fb-token',
      externalAccountId: 'page-1',
      externalAccountName: 'My Page',
    });
    service.connect(businessId, SocialPlatform.facebook);
    const state = lastCapturedState();

    const result = await service.handleCallback(
      SocialPlatform.facebook,
      'auth-code',
      state,
    );
    expect(result).toEqual({ businessId, ok: true });

    const row = await prisma.socialAccount.findUnique({
      where: {
        businessId_platform: { businessId, platform: SocialPlatform.facebook },
      },
    });
    expect(row?.status).toBe(SocialAccountStatus.connected);
  });

  it('handleCallback() lands the account in needs_attention when the real exchange fails', async () => {
    oauthConnector.handleCallback.mockRejectedValue(new Error('invalid_grant'));
    service.connect(businessId, SocialPlatform.facebook);
    const state = lastCapturedState();

    const result = await service.handleCallback(
      SocialPlatform.facebook,
      'auth-code',
      state,
    );
    expect(result.ok).toBe(false);

    const row = await prisma.socialAccount.findUnique({
      where: {
        businessId_platform: { businessId, platform: SocialPlatform.facebook },
      },
    });
    expect(row?.status).toBe(SocialAccountStatus.needs_attention);
  });

  it('handleCallback() rejects a tampered state param', async () => {
    await expect(
      service.handleCallback(
        SocialPlatform.facebook,
        'auth-code',
        'forged.state',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('disconnect() calls the connector and clears stored tokens', async () => {
    await service.disconnect(businessId, SocialPlatform.telegram);

    expect(tokenConnector.disconnect).toHaveBeenCalled();
    const row = await prisma.socialAccount.findUnique({
      where: {
        businessId_platform: { businessId, platform: SocialPlatform.telegram },
      },
    });
    expect(row?.status).toBe(SocialAccountStatus.not_connected);
    expect(row?.tokens).toBeNull();
  });

  function lastCapturedState(): string {
    const calls = oauthConnector.authUrl.mock.calls;
    return calls[calls.length - 1][0];
  }
});
