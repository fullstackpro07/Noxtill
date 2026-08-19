import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompetitiveOpportunitiesService } from '../competitive-opportunities.service';
import { COMPETITIVE_OPPORTUNITIES_QUEUE } from '../competitive.constants';

/**
 * Weekly gap-analysis generation (UPD-BE-054). Runs outside any request context, so — same as
 * AiInsightsProcessor — every business is processed independently with its own try/catch: one
 * business's AI call failing (rate limit, cost cap, or the disclosed missing-ANTHROPIC_API_KEY gap
 * in this dev environment) must never block every other business's run for the week.
 */
@Processor(COMPETITIVE_OPPORTUNITIES_QUEUE)
export class CompetitiveOpportunitiesProcessor extends WorkerHost {
  private readonly logger = new Logger(CompetitiveOpportunitiesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opportunities: CompetitiveOpportunitiesService,
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

    let total = 0;
    for (const { id: businessId } of businesses) {
      try {
        total += await this.opportunities.generateForBusiness(businessId);
      } catch (error) {
        this.logger.warn(
          `Competitive gap analysis failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Competitive gap analysis generated ${total} opportunity(ies) across ${businesses.length} business(es)`,
    );
  }
}
