import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { FsContextService } from './fs-context.service';
import { FsPlansService } from './fs-plans.service';
import { FS_QUEUE, OPEN } from './fs.constants';

@Injectable()
export class FieldServiceScheduler implements OnModuleInit {
  private readonly logger = new Logger(FieldServiceScheduler.name);

  constructor(@InjectQueue(FS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    void this.queue
      .add(
        'hourly',
        {},
        {
          repeat: { every: 60 * 60_000 },
          jobId: 'field-service-hourly',
          removeOnComplete: true,
          removeOnFail: 50,
        },
      )
      .catch((e: Error) =>
        this.logger.error(`Failed to register hourly: ${e.message}`),
      );
  }
}

/**
 * Hourly per business using Field Service: the preventive engine (idempotent per plan + period),
 * one SLA-breach alert per work order, and clearing technicians' check-in location past the
 * configured retention. Alerts are deduplicated through the audit log so a rerun never repeats.
 */
@Processor(FS_QUEUE)
export class FieldServiceProcessor extends WorkerHost {
  private readonly logger = new Logger(FieldServiceProcessor.name);

  constructor(
    private readonly ctx: FsContextService,
    private readonly plans: FsPlansService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const roots = await this.ctx.db.fsSettings.findMany({
      select: { businessId: true },
    });
    for (const { businessId: rootId } of roots) {
      try {
        await this.plans.evaluate(rootId);
        await this.sla(rootId);
        await this.retention(rootId);
      } catch (e) {
        this.logger.warn(
          `field-service hourly failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    }
  }

  private async once(rootId: string, key: string, detail: string) {
    const done = await this.ctx.db.fsAudit.findFirst({
      where: { businessId: rootId, entityType: 'notice', entityId: key },
    });
    if (done) return false;
    await this.ctx.audit(
      rootId,
      'System',
      'Notification sent',
      'notice',
      key,
      detail,
    );
    return true;
  }

  async sla(rootId: string) {
    const breached = await this.ctx.db.fsWorkOrder.findMany({
      where: {
        businessId: rootId,
        status: { in: OPEN.filter((s) => s !== 'Awaiting Customer') },
        slaDueAt: { lt: new Date() },
      },
      select: { id: true, number: true, techUserId: true, priority: true },
    });
    if (!breached.length) return;
    const to = await this.ctx.usersWith(rootId, CAPABILITIES.FIELD_DISPATCH);
    for (const w of breached) {
      if (!(await this.once(rootId, `sla:${w.id}`, `${w.number} SLA breached`)))
        continue;
      await this.ctx.notify(
        rootId,
        [...to, ...(w.techUserId ? [w.techUserId] : [])],
        `SLA breached · ${w.number}`,
        `${w.priority} job is past its SLA response time.`,
        `/field-service/work-orders/${w.id}`,
      );
    }
  }

  async retention(rootId: string) {
    const cfg = await this.ctx.config(rootId);
    await this.ctx.db.fsTechnician.updateMany({
      where: {
        businessId: rootId,
        lastZoneAt: {
          lt: new Date(Date.now() - cfg.tech.retentionDays * 86400000),
        },
      },
      data: { lastZone: null, lastZoneAt: null },
    });
  }
}
