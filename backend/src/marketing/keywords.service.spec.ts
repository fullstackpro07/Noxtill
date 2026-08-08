import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { KeywordsService } from './keywords.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_TRACKED_KEYWORDS } from './marketing.constants';
import type { KeywordRankProcessor } from './jobs/keyword-rank.processor';

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
    );

    const business = await prisma.business.create({
      data: { name: 'Keywords Test Biz', slug: `keywords-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    const keywords = await prisma.trackedKeyword.findMany({ where: { businessId } });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keywordId: { in: keywords.map((k) => k.id) } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
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

    const created = await service.create(businessId, { keyword: 'replacement' });
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

    expect(rankProcessor.checkOne).toHaveBeenCalledWith(businessId, keyword.id, 'trigger-test');
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
});
