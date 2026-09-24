import { ClsService } from 'nestjs-cls';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { SocialAccountsService } from '../social/social-accounts.service';
import { CompetitorSocialService } from './competitor-social.service';

const mockedGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockedGet(...args) as unknown },
}));

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

describe('CompetitorSocialService (Instagram Business Discovery)', () => {
  let prisma: PrismaService;
  let service: CompetitorSocialService;
  let businessId: string;
  let withHandleId: string;
  let noHandleId: string;
  const accounts = { getAccount: jest.fn(), getTokens: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CompetitorSocialService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      accounts as unknown as SocialAccountsService,
    );
    const business = await prisma.business.create({
      data: { name: 'Social Test Biz', slug: `comp-social-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    withHandleId = (
      await prisma.competitor.create({
        data: {
          businessId,
          name: 'Fresh Fades',
          platformRef: 'ff',
          instagramHandle: 'freshfades',
        },
      })
    ).id;
    noHandleId = (
      await prisma.competitor.create({
        data: { businessId, name: 'No Handle Co', platformRef: 'nh' },
      })
    ).id;
  });

  beforeEach(() => {
    mockedGet.mockReset();
    accounts.getAccount.mockReset();
    accounts.getTokens.mockReset();
  });

  afterAll(async () => {
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const connected = () => {
    accounts.getAccount.mockResolvedValue({
      status: 'connected',
      meta: { igUserId: 'ig-123' },
    });
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
  };

  it('says so — rather than reporting zero posts — when no handle is set', async () => {
    const result = await service.get(businessId, noHandleId);
    expect(result.status).toBe('no_handle');
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('says so when the business has not connected Instagram', async () => {
    accounts.getAccount.mockResolvedValue(null);
    accounts.getTokens.mockResolvedValue(null);
    const result = await service.get(businessId, withHandleId);
    expect(result.status).toBe('not_connected');
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('refuses a competitor from another business', async () => {
    await expect(
      service.get(businessId, 'not-a-real-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts posts in the last 30 and previous 30 days, formats, and top hashtags', async () => {
    connected();
    mockedGet.mockResolvedValue({
      data: {
        business_discovery: {
          followers_count: 5400,
          media_count: 212,
          media: {
            data: [
              {
                timestamp: daysAgoIso(2),
                media_type: 'VIDEO',
                caption: 'New cut #fade #Barber',
              },
              {
                timestamp: daysAgoIso(9),
                media_type: 'VIDEO',
                caption: 'Walk-ins welcome #fade',
              },
              {
                timestamp: daysAgoIso(20),
                media_type: 'IMAGE',
                caption: 'Before and after #fade #style',
              },
              {
                timestamp: daysAgoIso(40),
                media_type: 'CAROUSEL_ALBUM',
                caption: 'Old post #style',
              },
              {
                timestamp: daysAgoIso(75),
                media_type: 'IMAGE',
                caption: 'Too old to count',
              },
            ],
          },
        },
      },
    });

    const result = await service.get(businessId, withHandleId);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.followers).toBe(5400);
    expect(result.postsLast30).toBe(3);
    expect(result.postsPrev30).toBe(1);
    expect(result.formats).toEqual({ image: 1, video: 2, carousel: 0 });
    expect(result.topics[0]).toBe('#fade');
    expect(result.capped).toBe(false);

    // Called through the business's OWN Instagram user id, for the competitor's handle.
    const [url, opts] = mockedGet.mock.calls[0] as [
      string,
      { params: { fields: string } },
    ];
    expect(url).toContain('/ig-123');
    expect(opts.params.fields).toContain(
      'business_discovery.username(freshfades)',
    );
  });

  it('flags a full sample so a capped count is never presented as exact', async () => {
    connected();
    const media = Array.from({ length: 50 }, (_, i) => ({
      timestamp: daysAgoIso(i * 0.5),
      media_type: 'IMAGE' as const,
      caption: '',
    }));
    mockedGet.mockResolvedValue({
      data: { business_discovery: { media: { data: media } } },
    });
    const result = await service.get(businessId, withHandleId);
    expect(result.status === 'ok' && result.capped).toBe(true);
  });

  it('reports Instagram’s own reason when the lookup is rejected', async () => {
    connected();
    mockedGet.mockRejectedValue({
      response: { data: { error: { message: 'Invalid user id' } } },
    });
    const result = await service.get(businessId, withHandleId);
    expect(result).toEqual({
      status: 'unavailable',
      message: 'Invalid user id',
    });
  });
});
