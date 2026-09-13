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
    await prisma.privateFeedback.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
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
    // Trend-arrows depth fix — first-ever run for this business, no prior run to compare against.
    expect(themes[0].previousReviewCount).toBeNull();
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
    // Trend-arrows depth fix — same theme name as the previous run (reviewCount 1), so this
    // regeneration carries forward a real previous-count comparison rather than null.
    expect(themes[0].previousReviewCount).toBe(1);
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
    // Trend-arrows depth fix — a genuinely new theme name has no prior run to compare against.
    expect(themes[0].previousReviewCount).toBeNull();
  });

  it('gracefully returns 0 (never throws) when the AI call itself fails', async () => {
    complete.mockRejectedValue(new Error('AI down'));
    const count = await service.generateForBusiness(businessId);
    expect(count).toBe(0);
  });

  describe('generateComplaintThemesForBusiness() (Private Reviews depth fix, UPD-INT-008)', () => {
    it('clusters real PrivateFeedback messages under the private_feedback source, never touching public review themes', async () => {
      await prisma.privateFeedback.createMany({
        data: [
          {
            businessId,
            stars: 2,
            message:
              'The staff was rude and dismissive when I asked for a refund.',
          },
          {
            businessId,
            stars: 1,
            message: 'Rude staff again, nobody wanted to help me.',
          },
          {
            businessId,
            stars: 2,
            message: 'Staff attitude was rude the whole visit.',
          },
        ],
      });
      complete.mockResolvedValue(
        JSON.stringify([
          {
            theme: 'Rude staff',
            sentiment: 'negative',
            reviewIndices: [0],
            exampleQuote: 'rude and dismissive when I asked for a refund',
          },
        ]),
      );

      const count =
        await service.generateComplaintThemesForBusiness(businessId);
      expect(count).toBe(1);

      // The AI prompt itself must be told this is private feedback, not public reviews.
      const lastCall = complete.mock.calls[complete.mock.calls.length - 1] as [
        string,
        string,
      ];
      expect(lastCall[1]).toContain('private customer feedback');

      const complaintThemes = await service.list(
        businessId,
        'private_feedback',
      );
      expect(complaintThemes).toHaveLength(1);
      expect(complaintThemes[0].theme).toBe('Rude staff');
      expect(complaintThemes[0].source).toBe('private_feedback');

      // Regenerating public-review themes must never wipe out or merge with the complaint themes.
      complete.mockResolvedValue(
        JSON.stringify([
          {
            theme: 'Unrelated public theme',
            sentiment: 'positive',
            reviewIndices: [0],
            exampleQuote: 'anything',
          },
        ]),
      );
      await service.generateForBusiness(businessId);
      const stillThere = await service.list(businessId, 'private_feedback');
      expect(stillThere).toHaveLength(1);
      expect(stillThere[0].theme).toBe('Rude staff');

      const publicThemes = await service.list(businessId, 'public_review');
      expect(publicThemes.every((t) => t.source === 'public_review')).toBe(
        true,
      );
    });

    it('returns 0 and never calls the AI with too few complaint messages to cluster honestly', async () => {
      await prisma.privateFeedback.deleteMany({ where: { businessId } });
      await prisma.privateFeedback.create({
        data: { businessId, stars: 1, message: 'Only one complaint so far.' },
      });
      complete.mockClear();

      const count =
        await service.generateComplaintThemesForBusiness(businessId);
      expect(count).toBe(0);
      expect(complete).not.toHaveBeenCalled();
    });
  });
});
