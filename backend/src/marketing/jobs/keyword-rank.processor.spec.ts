import { PrismaService } from '../../prisma/prisma.service';
import { KeywordRankProcessor } from './keyword-rank.processor';
import { SerpRankService } from '../serp-rank.service';

describe('KeywordRankProcessor (BE-063 extension)', () => {
  let prisma: PrismaService;
  let processor: KeywordRankProcessor;
  let businessId: string;
  const serpRank = { fetchRank: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new KeywordRankProcessor(
      prisma,
      serpRank as unknown as SerpRankService,
    );

    const business = await prisma.business.create({
      data: { name: 'Rank Test Biz', slug: `rank-test-${Date.now()}` },
    });
    businessId = business.id;
  });

  afterEach(() => {
    serpRank.fetchRank.mockReset();
  });

  afterAll(async () => {
    const keywords = await prisma.trackedKeyword.findMany({
      where: { businessId },
    });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keywordId: { in: keywords.map((k) => k.id) } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('records a rank snapshot, including null when the business is not found in results', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'not ranked yet' },
    });
    serpRank.fetchRank.mockResolvedValue(null);

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
  });

  it('records a real rank when found', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'ranked keyword' },
    });
    serpRank.fetchRank.mockResolvedValue(4);

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
  });

  it('runCheck records a snapshot for a tracked keyword it finds', async () => {
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'run-check-test' },
    });
    serpRank.fetchRank.mockResolvedValue(9);

    await processor.runCheck();

    const snapshots = await prisma.keywordRankSnapshot.findMany({
      where: { keywordId: keyword.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].rank).toBe(9);
  });
});
