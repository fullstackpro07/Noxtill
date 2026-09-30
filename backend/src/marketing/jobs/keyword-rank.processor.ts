import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SerpRankService } from '../serp-rank.service';
import { GoogleTrendsService } from '../google-trends.service';
import { KEYWORD_RANK_QUEUE } from '../marketing.constants';

/**
 * `keyword-rank-check` (BE-063 extension): weekly rank check for every tracked keyword across
 * every business, via the real SerpApi-shaped lookup. Structured identically to
 * CompetitorSnapshotProcessor. It also captures the top-result title and the distinct URLs from
 * the business domain in that same result set, plus Google Trends interest (same SERPAPI_KEY).
 */
@Processor(KEYWORD_RANK_QUEUE)
export class KeywordRankProcessor extends WorkerHost {
  private readonly logger = new Logger(KeywordRankProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpRank: SerpRankService,
    private readonly trends: GoogleTrendsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runCheck();
  }

  async runCheck(): Promise<void> {
    const keywords = await this.prisma.trackedKeyword.findMany({
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

    let skippedWithoutWebsite = 0;
    for (const keyword of keywords) {
      if (!keyword.business.masterListing?.website?.trim()) {
        skippedWithoutWebsite += 1;
        continue;
      }
      try {
        await this.checkOne(
          keyword.businessId,
          keyword.id,
          keyword.keyword,
          keyword.business.name,
          keyword.business.masterListing?.website,
        );
      } catch (error) {
        // One keyword's business/provider hiccup shouldn't abort the whole weekly batch for everyone else.
        this.logger.warn(
          `Keyword rank check failed for keyword=${keyword.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Keyword rank check evaluated ${keywords.length} keyword(s); skipped ${skippedWithoutWebsite} without a configured website`,
    );
  }

  /** Shared by the weekly job and the "check now" manual-trigger endpoint. */
  async checkOne(
    businessId: string,
    keywordId: string,
    keyword: string,
    businessNameOverride?: string,
    websiteOverride?: string | null,
  ): Promise<void> {
    const business =
      businessNameOverride === undefined || websiteOverride === undefined
        ? await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
            include: { masterListing: { select: { website: true } } },
          })
        : null;
    const businessName = businessNameOverride ?? business?.name;
    const website = websiteOverride ?? business?.masterListing?.website;
    if (!businessName) {
      throw new Error('Business name is required to check keyword rankings');
    }

    const [{ rank, topResultTitle, businessResultUrls }, searchInterest] =
      await Promise.all([
        this.serpRank.fetchRank(keyword, businessName, website),
        this.trends.fetchInterest(keyword),
      ]);

    await this.prisma.keywordRankSnapshot.create({
      data: {
        keywordId,
        rank,
        topResultTitle,
        businessResultUrls,
        searchInterest,
      },
    });
  }
}
