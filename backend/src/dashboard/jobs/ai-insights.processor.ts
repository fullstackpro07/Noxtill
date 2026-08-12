import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiInsightsService } from '../ai-insights.service';
import { AI_INSIGHTS_QUEUE } from '../dashboard.constants';

/**
 * Daily AI Insights generation (UPD-BE-003). Runs outside any request context, so — same as
 * HealthScoreSnapshotProcessor — every business is processed independently with its own
 * try/catch: one business's AI call failing (rate limit, cost cap, or the disclosed
 * missing-ANTHROPIC_API_KEY gap in this dev environment) must never block every other business's
 * run for the day.
 */
@Processor(AI_INSIGHTS_QUEUE)
export class AiInsightsProcessor extends WorkerHost {
  private readonly logger = new Logger(AiInsightsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiInsightsService: AiInsightsService,
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

    let totalInsights = 0;
    for (const { id: businessId } of businesses) {
      try {
        totalInsights +=
          await this.aiInsightsService.generateForBusiness(businessId);
      } catch (error) {
        this.logger.warn(
          `AI insight generation failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `AI insights generated ${totalInsights} insight(s) across ${businesses.length} business(es)`,
    );
  }
}
