import { PrismaService } from '../../prisma/prisma.service';
import { KeywordRankProcessor } from './keyword-rank.processor';
import { SerpRankService, SerpRankResult } from '../serp-rank.service';
import { GoogleTrendsService } from '../google-trends.service';

describe('KeywordRankProcessor (BE-063 extension)', () => {
  let prisma: PrismaService;
  let processor: KeywordRankProcessor;
  let businessId: string;
  const serpRank = {
    fetchRank: jest.fn<Promise<SerpRankResult>, [string, string]>(),
  };
  const trends = { fetchInterest: jest.fn<Promise<number | null>, [string]>() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new KeywordRankProcessor(
      prisma,
      serpRank as unknown as SerpRankService,
      trends as unknown as GoogleTrendsService,
    );

    const business = await prisma.business.create({
      data: { name: 'Rank Test Biz', slug: `rank-test-${Date.now()}` },
    });
    businessId = business.id;
    await prisma.masterListing.create({
      data: {
        businessId,
        name: 'Rank Test Biz',
        website: 'https://rank-test.example',
      },
    });
  });

  afterEach(() => {
    serpRank.fetchRank.mockReset();
    trends.fetchInterest.mockReset();
  });

  afterAll(async () => {
    const keywords = await prisma.trackedKeyword.findMany({
      where: { businessId },
    });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keywordId: { in: keywords.map((k) => k.id) } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.masterListing.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('records a rank snapshot, including null when the business is not found in results', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'not ranked yet' },
    });
    serpRank.fetchRank.mockResolvedValue({
      rank: null,
      topResultTitle: 'Someone Else',
      businessResultUrls: [],
    });
    trends.fetchInterest.mockResolvedValue(null);

    await processor.checkOne(
      businessId,
      keyword.id,
      keyword.keyword,
      'Rank Test Biz',
    );

    const snapshots = await prisma.keywordRankSnapshot.findMany({
      where: { keywordId: keyword.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].rank).toBeNull();
    expect(snapshots[0].topResultTitle).toBe('Someone Else');
    expect(snapshots[0].businessResultUrls).toEqual([]);
    expect(snapshots[0].searchInterest).toBeNull();
  });

  it('records a real rank, top-result title, and search interest when found', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'ranked keyword' },
    });
    serpRank.fetchRank.mockResolvedValue({
      rank: 4,
      topResultTitle: 'Rank Test Biz',
      businessResultUrls: [
        'https://rank-test.example/page-a',
        'https://rank-test.example/page-b',
      ],
    });
    trends.fetchInterest.mockResolvedValue(62);

    await processor.checkOne(
      businessId,
      keyword.id,
      keyword.keyword,
      'Rank Test Biz',
    );

    const snapshots = await prisma.keywordRankSnapshot.findMany({
      where: { keywordId: keyword.id },
    });
    expect(snapshots[0].rank).toBe(4);
    expect(snapshots[0].topResultTitle).toBe('Rank Test Biz');
    expect(snapshots[0].businessResultUrls).toEqual([
      'https://rank-test.example/page-a',
      'https://rank-test.example/page-b',
    ]);
    expect(snapshots[0].searchInterest).toBe(62);
  });

  it('runCheck records a snapshot for a tracked keyword it finds', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'run-check-test' },
    });
    serpRank.fetchRank.mockResolvedValue({
      rank: 9,
      topResultTitle: 'Someone Else',
      businessResultUrls: [],
    });
    trends.fetchInterest.mockResolvedValue(30);

    // Keep this integration test scoped: runCheck without an id is the production-wide scheduler
    // path and would otherwise persist mocked SERP fixture data into every developer business.
    await processor.runCheck(businessId);

    const snapshots = await prisma.keywordRankSnapshot.findMany({
      where: { keywordId: keyword.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].rank).toBe(9);
  });
});
