import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SerpRankService } from '../serp-rank.service';
import { KEYWORD_RANK_QUEUE } from '../marketing.constants';

/**
 * `keyword-rank-check` (BE-063 extension): weekly rank check for every tracked keyword across
 * every business, via the real SerpApi-shaped lookup. Structured identically to
 * CompetitorSnapshotProcessor.
 */
@Processor(KEYWORD_RANK_QUEUE)
export class KeywordRankProcessor extends WorkerHost {
  private readonly logger = new Logger(KeywordRankProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpRank: SerpRankService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runCheck();
  }

  async runCheck(): Promise<void> {
    const keywords = await this.prisma.trackedKeyword.findMany({
      include: { business: true },
    });

    for (const keyword of keywords) {
      try {
        await this.checkOne(keyword.businessId, keyword.id, keyword.keyword, keyword.business.name);
      } catch (error) {
        // One keyword's business/provider hiccup shouldn't abort the whole weekly batch for everyone else.
        this.logger.warn(
          `Keyword rank check failed for keyword=${keyword.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(`Keyword rank check evaluated ${keywords.length} keyword(s)`);
  }

  /** Shared by the weekly job and the "check now" manual-trigger endpoint. */
  async checkOne(
    businessId: string,
    keywordId: string,
    keyword: string,
    businessNameOverride?: string,
  ): Promise<void> {
    const businessName =
      businessNameOverride ??
      (await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } })).name;

    const rank = await this.serpRank.fetchRank(keyword, businessName);

    await this.prisma.keywordRankSnapshot.create({
      data: { keywordId, rank },
    });
  }
}
