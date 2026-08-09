import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QUOTA_RESET_QUEUE } from '../billing.constants';

interface QuotaResetJobData {
  /** ISO timestamp override, used only by tests to make "now" deterministic. */
  now?: string;
}

function utcMonthStart(at: Date): Date {
  const start = new Date(at);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/**
 * `quota-reset` (INT-014): zeroes `Business.msgUsed` once a new UTC calendar month has started
 * since the business's last reset (or its very first reset, if `msgQuotaResetAt` is still null —
 * correctly lands on the first month boundary after signup, not immediately). No prior job
 * touched `msgUsed` at all before this — it only ever incremented.
 */
@Processor(QUOTA_RESET_QUEUE)
export class QuotaResetProcessor extends WorkerHost {
  private readonly logger = new Logger(QuotaResetProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<QuotaResetJobData>): Promise<void> {
    if (job.name !== 'tick') return;
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    return this.runReset(now);
  }

  async runReset(now: Date = new Date()): Promise<void> {
    const monthStart = utcMonthStart(now);

    const due = await this.prisma.business.findMany({
      where: {
        OR: [{ msgQuotaResetAt: null }, { msgQuotaResetAt: { lt: monthStart } }],
      },
    });

    for (const business of due) {
      await this.prisma.business.update({
        where: { id: business.id },
        data: { msgUsed: 0, msgQuotaResetAt: now },
      });
    }

    this.logger.debug(`Quota reset processed ${due.length} business(es)`);
  }
}
