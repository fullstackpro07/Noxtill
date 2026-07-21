import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { NightlyCloseService } from './nightly-close.service';
import { NIGHTLY_CLOSE_QUEUE } from './nightly-close.constants';

interface NightlyCloseJobData {
  businessId?: string;
}

/**
 * Hourly tick (spec §3.2): scans every business and enqueues a per-business
 * `run` job for the ones whose local time matches their configured
 * nightly_close_time. The `run` job is idempotency-keyed per business per
 * day so a duplicate tick can never double-send.
 */
@Processor(NIGHTLY_CLOSE_QUEUE)
export class NightlyCloseProcessor extends WorkerHost {
  private readonly logger = new Logger(NightlyCloseProcessor.name);

  constructor(
    @InjectQueue(NIGHTLY_CLOSE_QUEUE)
    private readonly queue: Queue<NightlyCloseJobData>,
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
    private readonly nightlyClose: NightlyCloseService,
  ) {
    super();
  }

  async process(job: Job<NightlyCloseJobData>): Promise<void> {
    if (job.name === 'tick') {
      return this.handleTick();
    }
    if (job.name === 'run' && job.data.businessId) {
      return this.nightlyClose.composeAndSend(job.data.businessId);
    }
  }

  private async handleTick(): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true, timezone: true, nightlyCloseTime: true },
    });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    for (const business of businesses) {
      const currentHour = this.locale
        .currentLocalTime(business.timezone)
        .slice(0, 2);
      const configuredHour = business.nightlyCloseTime.slice(0, 2);

      if (currentHour !== configuredHour) continue;

      await this.queue.add(
        'run',
        { businessId: business.id },
        { jobId: `nightly-close-run-${business.id}-${today}` },
      );
    }

    this.logger.debug(
      `Nightly close tick evaluated ${businesses.length} business(es)`,
    );
  }
}
