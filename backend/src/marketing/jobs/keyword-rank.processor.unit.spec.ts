import { PrismaService } from '../../prisma/prisma.service';
import { GoogleTrendsService } from '../google-trends.service';
import { SerpRankService } from '../serp-rank.service';
import { KeywordRankProcessor } from './keyword-rank.processor';

describe('KeywordRankProcessor provider wiring', () => {
  it('matches rankings against the business master-listing website', async () => {
    const business = {
      name: 'Noxtill Cafe',
      masterListing: { website: 'https://www.noxtill.example/menu' },
    };
    const prisma = {
      business: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(business),
      },
      keywordRankSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snapshot_1' }),
      },
    };
    const serpRank = {
      fetchRank: jest
        .fn()
        .mockResolvedValue({
          rank: 5,
          topResultTitle: 'Order online',
          businessResultUrls: ['https://www.noxtill.example/menu'],
        }),
    };
    const trends = { fetchInterest: jest.fn().mockResolvedValue(42) };
    const processor = new KeywordRankProcessor(
      prisma as unknown as PrismaService,
      serpRank as unknown as SerpRankService,
      trends as unknown as GoogleTrendsService,
    );

    await processor.checkOne('business_1', 'keyword_1', 'coffee shop');

    expect(prisma.business.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'business_1' },
      include: { masterListing: { select: { website: true } } },
    });
    expect(serpRank.fetchRank).toHaveBeenCalledWith(
      'coffee shop',
      'Noxtill Cafe',
      'https://www.noxtill.example/menu',
    );
    expect(prisma.keywordRankSnapshot.create).toHaveBeenCalledWith({
      data: {
        keywordId: 'keyword_1',
        rank: 5,
        topResultTitle: 'Order online',
        businessResultUrls: ['https://www.noxtill.example/menu'],
        searchInterest: 42,
      },
    });
  });

  it('uses the list job website and business name without an extra business lookup', async () => {
    const trackedKeyword = {
      id: 'keyword_1',
      businessId: 'business_1',
      keyword: 'coffee shop',
      business: {
        name: 'Noxtill Cafe',
        masterListing: { website: 'noxtill.example' },
      },
    };
    const prisma = {
      trackedKeyword: {
        findMany: jest.fn().mockResolvedValue([trackedKeyword]),
      },
      business: { findUniqueOrThrow: jest.fn() },
      keywordRankSnapshot: { create: jest.fn().mockResolvedValue({}) },
    };
    const serpRank = {
      fetchRank: jest
        .fn()
        .mockResolvedValue({
          rank: 5,
          topResultTitle: 'Order online',
          businessResultUrls: ['https://www.noxtill.example/menu'],
        }),
    };
    const trends = { fetchInterest: jest.fn().mockResolvedValue(null) };
    const processor = new KeywordRankProcessor(
      prisma as unknown as PrismaService,
      serpRank as unknown as SerpRankService,
      trends as unknown as GoogleTrendsService,
    );

    await processor.runCheck();

    expect(prisma.trackedKeyword.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        businessId: true,
        keyword: true,
        business: {
          select: {
            name: true,
            masterListing: { select: { website: true } },
          },
        },
      },
    });
    expect(prisma.business.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(serpRank.fetchRank).toHaveBeenCalledWith(
      'coffee shop',
      'Noxtill Cafe',
      'noxtill.example',
    );
  });

  it('skips weekly checks without a configured website instead of making a name-based rank claim', async () => {
    const prisma = {
      trackedKeyword: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'keyword_1',
            businessId: 'business_1',
            keyword: 'coffee shop',
            business: { name: 'Noxtill Cafe', masterListing: null },
          },
        ]),
      },
      business: { findUniqueOrThrow: jest.fn() },
      keywordRankSnapshot: { create: jest.fn().mockResolvedValue({}) },
    };
    const serpRank = { fetchRank: jest.fn() };
    const trends = { fetchInterest: jest.fn() };
    const processor = new KeywordRankProcessor(
      prisma as unknown as PrismaService,
      serpRank as unknown as SerpRankService,
      trends as unknown as GoogleTrendsService,
    );

    await processor.runCheck();

    expect(serpRank.fetchRank).not.toHaveBeenCalled();
    expect(trends.fetchInterest).not.toHaveBeenCalled();
    expect(prisma.keywordRankSnapshot.create).not.toHaveBeenCalled();
  });
});
