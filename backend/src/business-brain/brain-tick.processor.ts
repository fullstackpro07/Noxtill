import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BRAIN_TICK_QUEUE } from './brain.constants';
import { BrainWatchService } from './brain-watch.service';
import { BrainContextService } from './brain-context.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainReadingService, localDate } from './brain-reading.service';

@Injectable()
export class BrainTickScheduler implements OnModuleInit {
  private readonly logger = new Logger(BrainTickScheduler.name);

  constructor(@InjectQueue(BRAIN_TICK_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        { repeat: { pattern: '7 * * * *' }, jobId: 'business-brain-hourly' },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register Business Brain tick: ${error.message}`,
        ),
      );
  }
}

/**
 * Hourly: evaluate watch rules (and notify once when one trips), and make sure every trading
 * business has today's reading kept for History and "Resolved" — even if nobody opened the page.
 */
@Processor(BRAIN_TICK_QUEUE)
export class BrainTickProcessor extends WorkerHost {
  private readonly logger = new Logger(BrainTickProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly watch: BrainWatchService,
    private readonly context: BrainContextService,
    private readonly detectors: BrainDetectorsService,
    private readonly reading: BrainReadingService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    const since = new Date(Date.now() - 30 * 86400000);
    const [trading, watching] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        distinct: ['businessId'],
        select: { businessId: true },
      }),
      this.prisma.brainWatch.findMany({
        distinct: ['businessId'],
        select: { businessId: true },
      }),
    ]);
    const ids = [
      ...new Set([
        ...trading.map((t) => t.businessId),
        ...watching.map((w) => w.businessId),
      ]),
    ];
    for (const businessId of ids) {
      try {
        await this.cls.run(async () => {
          this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
          await this.watch.tick(businessId);
          await this.snapshot(businessId);
        });
      } catch (error) {
        this.logger.warn(
          `Business Brain tick failed for ${businessId}: ${(error as Error).message}`,
        );
      }
    }
  }

  async snapshot(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const exists = await this.prisma.brainSnapshot.findUnique({
      where: { businessId_day: { businessId, day: localDate(b.timezone) } },
    });
    if (exists) return;
    const system: AuthenticatedUser = {
      sub: 'system',
      businessId,
      role: Role.owner,
      capabilities: [],
    };
    const ctx = await this.context.build(system, {});
    const x = await this.detectors.read(ctx);
    const findings = await this.reading.visibleFindings(ctx, x);
    const signals = this.reading.signals(ctx, x, null);
    await this.reading.saveSnapshot(
      ctx,
      this.reading.state(ctx, x, findings),
      signals,
      findings,
      x,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.warn(
      `Business Brain worker connection error: ${error.message}`,
    );
  }
}
