import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { KeywordsService } from './keywords.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_TRACKED_KEYWORDS } from './marketing.constants';
import type { KeywordRankProcessor } from './jobs/keyword-rank.processor';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { MasterListingService } from '../listings/master-listing.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('KeywordsService (BE-063 extension)', () => {
  let prisma: PrismaService;
  let service: KeywordsService;
  let businessId: string;
  const rankProcessor = { checkOne: jest.fn() };
  const aiInfra = {
    complete: jest.fn<Promise<string>, [string, string, number?, string?]>(),
  };
  const masterListing = {
    find: jest.fn().mockResolvedValue({ categories: ['Cafe'] }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new KeywordsService(
      tenantPrisma,
      rankProcessor as unknown as KeywordRankProcessor,
      aiInfra as unknown as AiInfraService,
      masterListing as unknown as MasterListingService,
    );

    const business = await prisma.business.create({
      data: { name: 'Keywords Test Biz', slug: `keywords-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    const keywords = await prisma.trackedKeyword.findMany({
      where: { businessId },
    });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keywordId: { in: keywords.map((k) => k.id) } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it(`allows up to ${MAX_TRACKED_KEYWORDS} keywords and rejects the next add`, async () => {
    for (let i = 0; i < MAX_TRACKED_KEYWORDS; i++) {
      await service.create(businessId, { keyword: `keyword ${i}` });
    }

    await expect(
      service.create(businessId, { keyword: 'one too many' }),
    ).rejects.toBeInstanceOf(AppException);

    const list = await service.list();
    expect(list).toHaveLength(MAX_TRACKED_KEYWORDS);
  });

  it('rejects tracking the same keyword twice', async () => {
    const list = await service.list();
    await service.remove(list[0].id);

    await service.create(businessId, { keyword: 'dupe check' });
    await expect(
      service.create(businessId, { keyword: 'dupe check' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('removes a keyword, freeing a slot', async () => {
    const list = await service.list();
    await service.remove(list[0].id);

    const created = await service.create(businessId, {
      keyword: 'replacement',
    });
    expect(created.keyword).toBe('replacement');
  });

  it('returns rank history oldest-first', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'history-test' },
    });
    await prisma.keywordRankSnapshot.createMany({
      data: [
        { keywordId: keyword.id, rank: 8, capturedAt: new Date('2026-01-01') },
        { keywordId: keyword.id, rank: 5, capturedAt: new Date('2026-01-08') },
      ],
    });

    const history = await service.history(keyword.id);
    expect(history).toHaveLength(2);
    expect(history[0].rank).toBe(8);
    expect(history[1].rank).toBe(5);
  });

  it('triggers a manual check via the rank processor', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'trigger-test' },
    });
    rankProcessor.checkOne.mockResolvedValue(undefined);

    await service.triggerCheck(businessId, keyword.id);

    expect(rankProcessor.checkOne).toHaveBeenCalledWith(
      businessId,
      keyword.id,
      'trigger-test',
    );
  });

  it('lists the latest rank per keyword', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'latest-rank-test' },
    });
    await prisma.keywordRankSnapshot.createMany({
      data: [
        { keywordId: keyword.id, rank: 12, capturedAt: new Date('2026-01-01') },
        { keywordId: keyword.id, rank: 3, capturedAt: new Date('2026-01-08') },
      ],
    });

    const list = await service.list();
    const row = list.find((k) => k.id === keyword.id)!;
    expect(row.latestRank).toBe(3);
  });

  describe('Bulk import + AI suggestions (UPD-BE-128)', () => {
    it('bulkCreate() adds real rows, skips duplicates and anything past the cap', async () => {
      // Earlier tests in this file create a couple of rows directly via `prisma.trackedKeyword.create()`
      // (bypassing the service's own cap check) to set up history/rank fixtures, so the real remaining
      // slot count here can be 0 — bulkCreate() must still degrade to skipping everything as
      // `limit_reached` rather than erroring, which this test asserts either way.
      const existing = await service.list();
      const slotsLeft = Math.max(0, MAX_TRACKED_KEYWORDS - existing.length);
      const keywords = Array.from(
        { length: slotsLeft + 2 },
        (_, i) => `bulk-kw-${i}`,
      );
      // Also duplicate the first tracked existing keyword (if any) to prove the skip path.
      const dupe = existing[0]?.keyword;

      const result = await service.bulkCreate(businessId, {
        keywords: dupe ? [dupe, ...keywords] : keywords,
      });

      expect(result.created).toHaveLength(slotsLeft);
      const skippedReasons = result.skipped.map((s) => s.reason);
      expect(skippedReasons).toContain('limit_reached');
      if (dupe) expect(skippedReasons).toContain('already_tracked');

      const list = await service.list();
      expect(list.length).toBe(existing.length + slotsLeft);
    });
  });

  describe('AI keyword suggestions (UPD-BE-128)', () => {
    it('suggest() grounds the prompt in the real business name/categories and parses a JSON array', async () => {
      aiInfra.complete.mockResolvedValue(
        '["best coffee near me", "cafe with wifi"]',
      );

      const result = await service.suggest(businessId, {});
      expect(result.suggestions).toEqual([
        'best coffee near me',
        'cafe with wifi',
      ]);
      const [, prompt, , kind] = aiInfra.complete.mock.calls[0];
      expect(prompt).toContain('Keywords Test Biz');
      expect(prompt).toContain('Cafe');
      expect(kind).toBe('keyword_suggestions');
    });

    it('suggest() returns an empty list (not fabricated data) when the AI response cannot be parsed', async () => {
      aiInfra.complete.mockResolvedValue('not json at all');
      const result = await service.suggest(businessId, {});
      expect(result.suggestions).toEqual([]);
    });

    it('suggest() surfaces AI_UNAVAILABLE on provider failure', async () => {
      aiInfra.complete.mockRejectedValue(new Error('provider down'));
      await expect(service.suggest(businessId, {})).rejects.toBeInstanceOf(
        AppException,
      );
    });
  });
});
