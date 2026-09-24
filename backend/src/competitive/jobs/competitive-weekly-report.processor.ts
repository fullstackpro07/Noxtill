import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompetitiveWeeklyReportService } from '../competitive-weekly-report.service';
import { COMPETITIVE_WEEKLY_REPORT_QUEUE } from '../competitive.constants';

/**
 * Sends the weekly report to every business that has set a recipient. Each business is processed
 * independently — one bad address or provider error must not stop the rest.
 */
@Processor(COMPETITIVE_WEEKLY_REPORT_QUEUE)
export class CompetitiveWeeklyReportProcessor extends WorkerHost {
  private readonly logger = new Logger(CompetitiveWeeklyReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly report: CompetitiveWeeklyReportService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runReports();
  }

  async runReports(): Promise<void> {
    const targets = await this.prisma.competitiveSettings.findMany({
      where: { weeklyReportRecipient: { not: null } },
      select: { businessId: true },
    });

    let sent = 0;
    for (const { businessId } of targets) {
      const result = await this.report.sendForBusiness(businessId);
      if (result.sent) sent += 1;
    }
    this.logger.debug(
      `Competitive weekly report sent to ${sent} of ${targets.length} business(es)`,
    );
  }
}
