import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PpContextService } from './pp-context.service';
import { PpRecruitService } from './pp-recruit.service';
import { PpHrService } from './pp-hr.service';
import { PP_QUEUE } from './pp.constants';

@Injectable()
export class PeopleScheduler implements OnModuleInit {
  private readonly logger = new Logger(PeopleScheduler.name);

  constructor(@InjectQueue(PP_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    void this.queue
      .add(
        'hourly',
        {},
        {
          repeat: { every: 60 * 60_000 },
          jobId: 'people-hourly',
          removeOnComplete: true,
          removeOnFail: 50,
        },
      )
      .catch((e: Error) =>
        this.logger.error(`Failed to register hourly: ${e.message}`),
      );
  }
}

const DAY = 86400000;

/**
 * Hourly per business using People & Payroll: reads offer signatures from Noxtill eSign, expires
 * unanswered offers, completes onboarding/offboarding items from their owning systems (task Done,
 * login active, scheduled access revocation), and sends one reminder per overdue training,
 * expiring certificate and ending probation (deduplicated through PpIdem so a rerun never repeats).
 */
@Processor(PP_QUEUE)
export class PeopleProcessor extends WorkerHost {
  private readonly logger = new Logger(PeopleProcessor.name);

  constructor(
    private readonly ctx: PpContextService,
    private readonly recruit: PpRecruitService,
    private readonly hr: PpHrService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const roots = await this.ctx.db.ppSettings.findMany({
      select: { businessId: true },
    });
    for (const { businessId } of roots) {
      try {
        await this.run(businessId);
      } catch (e) {
        this.logger.warn(
          `people hourly failed for ${businessId}: ${(e as Error).message}`,
        );
      }
    }
  }

  private async once(rootId: string, key: string, fn: () => Promise<unknown>) {
    const k = key.slice(0, 120);
    if (
      await this.ctx.db.ppIdem.findUnique({
        where: { businessId_key: { businessId: rootId, key: k } },
      })
    )
      return;
    await this.ctx.db.ppIdem.create({
      data: { businessId: rootId, key: k, status: 'done' },
    });
    await fn();
  }

  async run(rootId: string) {
    const db = this.ctx.db;
    const now = new Date();
    for (const o of await db.ppOffer.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Sent', 'Viewed', 'Signature Requested'] },
      },
    })) {
      const r = await this.recruit.syncSign(rootId, o);
      if (!r.changed && o.expiresOn.getTime() + DAY < now.getTime()) {
        await db.ppOffer.update({
          where: { id: o.id },
          data: { status: 'Expired' },
        });
        await this.ctx.audit(
          rootId,
          'System',
          'Offer expired',
          'offer',
          o.id,
          `${o.number} · no response by ${o.expiresOn.toISOString().slice(0, 10)}`,
        );
        await this.ctx.notify(
          rootId,
          [o.createdById],
          `Offer expired: ${o.number}`,
          'No signature before the expiry date',
          '/people/offers',
        );
      }
    }
    await this.hr.syncOnboarding(rootId);
    await this.hr.syncOffboarding(rootId);
    for (const t of await db.ppTraining.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Assigned', 'In Progress'] },
        dueOn: { lt: now },
      },
    }))
      await this.once(rootId, `trdue_${t.id}`, () =>
        this.ctx.notify(
          rootId,
          [t.userId],
          'Training overdue',
          `${t.number} was due ${t.dueOn.toISOString().slice(0, 10)}`,
          '/people/training',
        ),
      );
    for (const t of await db.ppTraining.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Completed', 'Verified'] },
        certExpires: { lte: new Date(now.getTime() + 30 * DAY), gte: now },
      },
    }))
      await this.once(rootId, `cert30_${t.id}`, () =>
        this.ctx.notify(
          rootId,
          [t.userId],
          'Certificate expiring',
          `${t.number} expires ${t.certExpires!.toISOString().slice(0, 10)}`,
          '/people/training',
        ),
      );
    for (const p of await db.ppEmployee.findMany({
      where: {
        businessId: rootId,
        status: 'Probation',
        probationEnd: { lte: new Date(now.getTime() + 14 * DAY), gte: now },
      },
    }))
      await this.once(
        rootId,
        `prob14_${p.id}_${p.probationEnd!.toISOString().slice(0, 10)}`,
        async () => {
          const bu = await db.businessUser.findUnique({
            where: { id: p.businessUserId },
            include: { user: { select: { name: true } } },
          });
          await this.ctx.notify(
            rootId,
            p.managerUserId
              ? [p.managerUserId]
              : await this.ctx.ownerIds(rootId),
            `Probation ends soon: ${bu?.user.name ?? ''}`,
            `Ends ${p.probationEnd!.toISOString().slice(0, 10)} — confirm or extend in People`,
            '/people/performance',
          );
        },
      );
  }
}
