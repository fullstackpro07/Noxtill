import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SentimentAnalysisService } from './sentiment-analysis.service';
import type { AiInfraService } from '../ai/ai-infra.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SentimentAnalysisService (UPD-BE-076)', () => {
  let prisma: PrismaService;
  let service: SentimentAnalysisService;
  let businessId: string;
  const complete = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SentimentAnalysisService(tenantPrisma, {
      complete,
    } as unknown as AiInfraService);

    const business = await prisma.business.create({
      data: {
        name: 'Sentiment Test Biz',
        slug: `sentiment-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    complete.mockReset();
  });

  afterAll(async () => {
    await prisma.reviewSentimentTheme.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('returns 0 and never calls the AI when there are too few reviews with text to cluster honestly', async () => {
    await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `only-one-${Date.now()}`,
        stars: 5,
        text: 'Great!',
      },
    });
    const count = await service.generateForBusiness(businessId);
    expect(count).toBe(0);
    expect(complete).not.toHaveBeenCalled();
  });

  it('stores a theme with the AI-provided quote when it is real, verbatim text from a referenced review', async () => {
    await prisma.externalReview.createMany({
      data: [
        {
          businessId,
          platform: 'google',
          externalId: `slow-1-${Date.now()}`,
          stars: 2,
          text: 'The service was way too slow, we waited 40 minutes for a table.',
        },
        {
          businessId,
          platform: 'google',
          externalId: `slow-2-${Date.now()}`,
          stars: 3,
          text: 'Food was fine but service was slow again.',
        },
        {
          businessId,
          platform: 'google',
          externalId: `slow-3-${Date.now()}`,
          stars: 1,
          text: 'Never coming back, slow service every time.',
        },
      ],
    });
    complete.mockResolvedValue(
      JSON.stringify([
        {
          theme: 'Slow service',
          sentiment: 'negative',
          reviewIndices: [0],
          exampleQuote: 'we waited 40 minutes for a table',
        },
      ]),
    );

    const count = await service.generateForBusiness(businessId);
    expect(count).toBe(1);

    const themes = await service.list(businessId);
    expect(themes).toHaveLength(1);
    expect(themes[0].theme).toBe('Slow service');
    expect(themes[0].exampleQuote).toBe('we waited 40 minutes for a table');
  });

  it('replaces the AI quote with the real review text when the AI quote cannot be verified verbatim (never fabricates)', async () => {
    complete.mockResolvedValue(
      JSON.stringify([
        {
          theme: 'Slow service',
          sentiment: 'negative',
          reviewIndices: [0],
          exampleQuote:
            'this quote was invented and never appears in the review',
        },
      ]),
    );

    await service.generateForBusiness(businessId);
    const themes = await service.list(businessId);
    expect(themes).toHaveLength(1);
    expect(themes[0].exampleQuote).not.toBe(
      'this quote was invented and never appears in the review',
    );
    expect(themes[0].exampleQuote.length).toBeGreaterThan(0);
  });

  it('regenerating replaces the previous themes rather than accumulating duplicates', async () => {
    complete.mockResolvedValue(
      JSON.stringify([
        {
          theme: 'New theme',
          sentiment: 'positive',
          reviewIndices: [0],
          exampleQuote: 'anything',
        },
      ]),
    );
    await service.generateForBusiness(businessId);
    const themes = await service.list(businessId);
    expect(themes).toHaveLength(1);
    expect(themes[0].theme).toBe('New theme');
  });

  it('gracefully returns 0 (never throws) when the AI call itself fails', async () => {
    complete.mockRejectedValue(new Error('AI down'));
    const count = await service.generateForBusiness(businessId);
    expect(count).toBe(0);
  });
});
