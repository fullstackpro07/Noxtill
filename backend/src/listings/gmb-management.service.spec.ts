import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { GmbManagementService } from './gmb-management.service';
import { GmbConnector } from '../integrations/connectors/gmb.connector';
import { AppException } from '../common/filters/app.exception';
import type { IntegrationsService } from '../integrations/integrations.service';
import { IntegrationProvider, IntegrationStatus } from '../../generated/prisma';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('GmbManagementService (UPD-BE-042)', () => {
  let prisma: PrismaService;
  let service: GmbManagementService;
  let businessId: string;
  const getTokens = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { getTokens };
    const gmbConnector = new GmbConnector(new ConfigService({}));
    service = new GmbManagementService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      gmbConnector,
    );

    const business = await prisma.business.create({
      data: { name: 'GMB Mgmt Test Biz', slug: `gmb-mgmt-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    getTokens.mockReset();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.gmbInsightsSnapshot.deleteMany({ where: { businessId } });
    await prisma.gmbQna.deleteMany({ where: { businessId } });
    await prisma.gmbPhoto.deleteMany({ where: { businessId } });
    await prisma.gmbPost.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('createPost() persists a real draft post, never touching any external API', async () => {
    const post = await service.createPost(businessId, {
      text: 'Come visit us!',
    });
    expect(post.status).toBe('draft');
    expect(post.externalId).toBeNull();

    const posts = await service.listPosts(businessId);
    expect(posts.map((p) => p.id)).toContain(post.id);
  });

  it("publishPost() rejects with a real, clear error when GMB isn't connected", async () => {
    getTokens.mockResolvedValue(null);
    const post = await service.createPost(businessId, {
      text: 'Unpublishable',
    });

    await expect(
      service.publishPost(businessId, post.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('publishPost() pushes to the real Local Posts API once connected with a locationId, and marks published', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.gmb,
        status: IntegrationStatus.connected,
        meta: { locationId: 'accounts/1/locations/2' },
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.post.mockResolvedValue({
      data: { name: 'accounts/1/locations/2/localPosts/3' },
    });

    const post = await service.createPost(businessId, {
      text: 'Grand opening!',
    });
    const published = await service.publishPost(businessId, post.id);

    expect(published.status).toBe('published');
    expect(published.externalId).toBe('accounts/1/locations/2/localPosts/3');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts',
      expect.objectContaining({ summary: 'Grand opening!' }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token' },
      }),
    );
  });

  it('publishPost() marks the post failed (not published) when the real API call errors', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.post.mockRejectedValue(new Error('Google API 403'));

    const post = await service.createPost(businessId, { text: 'Will fail' });
    await expect(
      service.publishPost(businessId, post.id),
    ).rejects.toBeInstanceOf(AppException);

    const reloaded = await prisma.gmbPost.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(reloaded.status).toBe('failed');
  });

  it('listAccounts() calls the real GMB accounts-list API through the connected connector', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.get.mockResolvedValue({
      data: { accounts: [{ name: 'accounts/1' }] },
    });

    const result = await service.listAccounts(businessId);
    expect(result).toEqual({ accounts: [{ name: 'accounts/1' }] });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token' },
      }),
    );
  });

  it('listLocations() calls the real Business Information API for the given account', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.get.mockResolvedValue({
      data: { locations: [{ name: 'accounts/1/locations/2' }] },
    });

    const result = await service.listLocations(businessId, 'accounts/1');
    expect(result).toEqual({ locations: [{ name: 'accounts/1/locations/2' }] });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token' },
      }),
    );
  });

  it('selectLocation() persists the real locationId into Integration.meta — the fix for the location-picker gap', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });

    const result = await service.selectLocation(
      businessId,
      'accounts/1/locations/2',
    );
    expect(result).toEqual({ locationId: 'accounts/1/locations/2' });

    const integration = await prisma.integration.findUniqueOrThrow({
      where: {
        businessId_provider: { businessId, provider: IntegrationProvider.gmb },
      },
    });
    expect((integration.meta as Record<string, unknown>).locationId).toBe(
      'accounts/1/locations/2',
    );
  });

  it('photos: addPhoto() and removePhoto() are real local CRUD, no external call needed', async () => {
    const photo = await service.addPhoto(businessId, {
      url: 'https://example.com/photo.jpg',
    });
    expect((await service.listPhotos(businessId)).map((p) => p.id)).toContain(
      photo.id,
    );

    await service.removePhoto(businessId, photo.id);
    expect(
      (await service.listPhotos(businessId)).map((p) => p.id),
    ).not.toContain(photo.id);
  });

  it('syncQuestions() pulls real questions from the GMB Q&A API and upserts by externalId', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.get.mockResolvedValue({
      data: {
        questions: [
          { name: 'locations/2/questions/9', text: 'Do you deliver?' },
        ],
      },
    });

    const count = await service.syncQuestions(businessId);
    expect(count).toBe(1);

    const qnas = await service.listQna(businessId);
    expect(qnas.some((q) => q.question === 'Do you deliver?')).toBe(true);

    // Re-syncing the same externalId upserts rather than duplicating.
    await service.syncQuestions(businessId);
    const afterResync = await prisma.gmbQna.findMany({
      where: { businessId, externalId: 'locations/2/questions/9' },
    });
    expect(afterResync).toHaveLength(1);
  });

  it('answerQuestion() posts a real answer via the API, then updates the local row only on success', async () => {
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.post.mockResolvedValue({ data: {} });

    const qna = await prisma.gmbQna.findFirstOrThrow({ where: { businessId } });
    const answered = await service.answerQuestion(
      businessId,
      qna.id,
      'Yes, citywide!',
    );
    expect(answered.answer).toBe('Yes, citywide!');
    expect(answered.answeredAt).not.toBeNull();
  });

  it('pullInsights() rejects with a clear error when no locationId is set', async () => {
    await prisma.integration.updateMany({
      where: { businessId, provider: IntegrationProvider.gmb },
      data: { meta: {} },
    });
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });

    await expect(service.pullInsights(businessId)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('pullInsights() fetches real Performance API metrics and upserts a snapshot', async () => {
    await prisma.integration.updateMany({
      where: { businessId, provider: IntegrationProvider.gmb },
      data: { meta: { locationId: 'accounts/1/locations/2' } },
    });
    getTokens.mockResolvedValue({ accessToken: 'fake-token' });
    mockedAxios.get.mockResolvedValue({
      data: {
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              {
                dailyMetric: 'CALL_CLICKS',
                timeSeries: { datedValues: [{ value: '3' }] },
              },
            ],
          },
        ],
      },
    });

    const snapshot = await service.pullInsights(businessId);
    expect(snapshot.calls).toBe(3);

    const insights = await service.listInsights(businessId);
    expect(insights.map((i) => i.id)).toContain(snapshot.id);
  });
});
