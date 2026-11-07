import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { ClsService } from 'nestjs-cls';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { SEO_AUDIT_QUEUE } from '../marketing.constants';
import { SeoSiteAuditService } from '../seo-site-audit.service';

const HOUR_MS = 60 * 60 * 1000;
const SCHEDULE_LEASE_MS = 30 * 60 * 1000;

@Injectable()
export class SeoAuditScheduleScheduler implements OnModuleInit {
  private readonly logger = new Logger(SeoAuditScheduleScheduler.name);

  constructor(@InjectQueue(SEO_AUDIT_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/15 * * * *' },
          jobId: 'seo-audit-schedule-15min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register SEO audit tick: ${error.message}`,
        ),
      );
  }
}

@Processor(SEO_AUDIT_QUEUE)
export class SeoAuditScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(SeoAuditScheduleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly siteAudit: SeoSiteAuditService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    await this.runDue();
  }

  async runDue(now = new Date()): Promise<void> {
    const expiredLease = new Date(now.getTime() - SCHEDULE_LEASE_MS);
    const schedules = await this.prisma.seoAuditSchedule.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
        OR: [{ processingAt: null }, { processingAt: { lt: expiredLease } }],
      },
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
    });

    for (const schedule of schedules) {
      const claim = await this.prisma.seoAuditSchedule.updateMany({
        where: {
          id: schedule.id,
          businessId: schedule.businessId,
          enabled: true,
          nextRunAt: { lte: now },
          OR: [{ processingAt: null }, { processingAt: { lt: expiredLease } }],
        },
        data: { processingAt: now },
      });
      if (claim.count !== 1) continue;

      try {
        const run = await this.cls.run(async () => {
          this.cls.set(CLS_KEY_BUSINESS_ID, schedule.businessId);
          return this.siteAudit.run(schedule.businessId, 'schedule');
        });
        await this.finish(schedule.id, schedule.businessId, now, {
          lastRunId: run.id,
          lastStatus: run.status,
          lastError: run.error,
        });
      } catch (error) {
        this.logger.warn(
          `Scheduled SEO audit failed for business ${schedule.businessId}: ${(error as Error).message}`,
        );
        await this.finish(schedule.id, schedule.businessId, now, {
          lastRunId: null,
          lastStatus: 'failed',
          lastError:
            'The scheduled audit did not complete. Check the configured website and backend logs.',
        });
      }
    }
  }

  private async finish(
    id: string,
    businessId: string,
    leaseAt: Date,
    result: {
      lastRunId: string | null;
      lastStatus: string;
      lastError: string | null;
    },
  ) {
    const current = await this.prisma.seoAuditSchedule.findFirst({
      where: { id, businessId, processingAt: leaseAt },
      select: { enabled: true, intervalHours: true },
    });
    if (!current) return;

    await this.prisma.seoAuditSchedule.updateMany({
      where: { id, businessId, processingAt: leaseAt },
      data: {
        lastRunAt: new Date(),
        lastRunId: result.lastRunId,
        lastStatus: result.lastStatus,
        lastError: result.lastError,
        nextRunAt: current.enabled
          ? new Date(Date.now() + current.intervalHours * HOUR_MS)
          : null,
        processingAt: null,
      },
    });
  }
}
