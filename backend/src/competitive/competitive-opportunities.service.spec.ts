import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AiInfraService } from '../ai/ai-infra.service';
import { MasterListingService } from '../listings/master-listing.service';
import { ListingSyncService } from '../listings/listing-sync.service';
import { CompetitiveOpportunitiesService } from './competitive-opportunities.service';
import { CompetitiveSettingsService } from './competitive-settings.service';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CompetitiveOpportunitiesService (UPD-BE-054)', () => {
  let prisma: PrismaService;
  let service: CompetitiveOpportunitiesService;
  let businessId: string;
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const masterListing = new MasterListingService(tenantPrisma);
    const connectors = { directoryProviders: () => [] };
    const listingSync = new ListingSyncService(
      tenantPrisma,
      {} as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      masterListing,
    );
    const settings = new CompetitiveSettingsService(tenantPrisma);
    service = new CompetitiveOpportunitiesService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
      settings,
      listingSync,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Competitive Opportunities Test Biz',
        slug: `competitive-opportunities-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    aiInfra.complete.mockReset();
  });

  afterAll(async () => {
    await prisma.competitiveOpportunity.deleteMany({ where: { businessId } });
    await prisma.competitiveSettings.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keyword: { businessId } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  describe('gatherGaps()', () => {
    it('flags a brand-new business as having no reviews yet', async () => {
      const gaps = await service.gatherGaps(businessId);
      const reviewGap = gaps.find((g) => g.kind === 'review');
      expect(reviewGap?.evidence).toBe('No reviews recorded yet');
      expect(gaps.find((g) => g.kind === 'keyword')).toBeUndefined();
    });

    it('flags a tracked keyword ranking outside the alert threshold', async () => {
      const keyword = await prisma.trackedKeyword.create({
        data: { businessId, keyword: 'best tailor in town' },
      });
      await prisma.keywordRankSnapshot.create({
        data: { keywordId: keyword.id, rank: 25 },
      });

      const gaps = await service.gatherGaps(businessId);
      const keywordGap = gaps.find((g) => g.kind === 'keyword');
      expect(keywordGap?.evidence).toContain('#25');
      expect(keywordGap?.evidenceRef).toBe('best tailor in town');
    });

    it('does not flag a keyword ranking inside the threshold', async () => {
      const keyword = await prisma.trackedKeyword.create({
        data: { businessId, keyword: 'well ranked shop' },
      });
      await prisma.keywordRankSnapshot.create({
        data: { keywordId: keyword.id, rank: 2 },
      });

      const gaps = await service.gatherGaps(businessId);
      expect(
        gaps.find((g) => g.evidenceRef === 'well ranked shop'),
      ).toBeUndefined();
    });

    it('flags an unreplied review as a real gap', async () => {
      await prisma.externalReview.create({
        data: {
          businessId,
          platform: 'google',
          externalId: `ext-${Date.now()}`,
          stars: 3,
        },
      });

      const gaps = await service.gatherGaps(businessId);
      expect(
        gaps.some(
          (g) => g.kind === 'review' && g.evidence.includes('awaiting a reply'),
        ),
      ).toBe(true);
    });
  });

  describe('generateForBusiness() / list() / listRecommendations() / dismiss()', () => {
    it('writes real opportunity rows with AI-phrased recommendations when the AI call succeeds', async () => {
      aiInfra.complete.mockImplementation((_biz: string, prompt: string) => {
        const gapCount = (prompt.match(/^\d+\. \[/gm) || []).length;
        return Promise.resolve(
          JSON.stringify(
            Array.from({ length: gapCount }, (_, i) => `Do action ${i + 1}.`),
          ),
        );
      });

      const count = await service.generateForBusiness(businessId);
      expect(count).toBeGreaterThan(0);

      const rows = await service.list(businessId);
      expect(rows).toHaveLength(count);
      expect(rows.every((r) => r.recommendation?.startsWith('Do action'))).toBe(
        true,
      );

      const recommendations = await service.listRecommendations(businessId);
      expect(recommendations).toHaveLength(count);
    });

    it('leaves recommendation null (not a duplicated evidence string) when the AI call fails', async () => {
      aiInfra.complete.mockRejectedValue(
        new Error('ANTHROPIC_API_KEY is not configured'),
      );

      const count = await service.generateForBusiness(businessId);
      expect(count).toBeGreaterThan(0);

      const rows = await service.list(businessId);
      expect(rows.every((r) => r.recommendation === null)).toBe(true);

      const recommendations = await service.listRecommendations(businessId);
      expect(recommendations).toHaveLength(0);
    });

    it('dismissing an opportunity hides it from list() even after the next regeneration', async () => {
      const [toDismiss] = await service.list(businessId);
      await service.dismiss(businessId, toDismiss.id);

      aiInfra.complete.mockResolvedValue('not valid json');
      await service.generateForBusiness(businessId);

      const rows = await service.list(businessId);
      expect(rows.find((r) => r.id === toDismiss.id)).toBeUndefined();

      const stillThere = await prisma.competitiveOpportunity.findUnique({
        where: { id: toDismiss.id },
      });
      expect(stillThere?.dismissed).toBe(true);
    });

    it('rejects dismissing an opportunity that belongs to a different business', async () => {
      const other = await prisma.business.create({
        data: { name: 'Other Biz', slug: `other-biz-${Date.now()}` },
      });
      const foreign = await prisma.competitiveOpportunity.create({
        data: { businessId: other.id, kind: 'review', evidence: 'x' },
      });

      await expect(service.dismiss(businessId, foreign.id)).rejects.toThrow();

      await prisma.competitiveOpportunity.delete({ where: { id: foreign.id } });
      await prisma.business.delete({ where: { id: other.id } });
    });
  });
});
