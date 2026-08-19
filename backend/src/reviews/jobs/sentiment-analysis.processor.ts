import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SentimentAnalysisService } from '../sentiment-analysis.service';
import { SENTIMENT_ANALYSIS_QUEUE } from '../sentiment-analysis.constants';

/**
 * Daily Sentiment Analysis generation (UPD-BE-076). Runs outside any request context, so — same
 * as `AiInsightsProcessor` — every business is processed independently with its own try/catch:
 * one business's AI call failing must never block every other business's run for the day.
 */
@Processor(SENTIMENT_ANALYSIS_QUEUE)
export class SentimentAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(SentimentAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sentimentAnalysis: SentimentAnalysisService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runGeneration();
  }

  async runGeneration(): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true },
    });

    let totalThemes = 0;
    for (const { id: businessId } of businesses) {
      try {
        totalThemes +=
          await this.sentimentAnalysis.generateForBusiness(businessId);
      } catch (error) {
        this.logger.warn(
          `Sentiment analysis failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Sentiment analysis generated ${totalThemes} theme(s) across ${businesses.length} business(es)`,
    );
  }
}
