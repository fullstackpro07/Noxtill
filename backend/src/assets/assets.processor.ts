import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Role } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { AmContextService } from './am-context.service';
import { AmPmService } from './am-pm.service';

export const ASSETS_QUEUE = 'assets-maintenance';

@Injectable()
export class AssetsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AssetsScheduler.name);

  constructor(@InjectQueue(ASSETS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    const add = (name: string, every: number) =>
      this.queue
        .add(
          name,
          {},
          {
            repeat: { every },
            jobId: `assets-${name}`,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        )
        .catch((e: Error) =>
          this.logger.error(`Failed to register ${name}: ${e.message}`),
        );
    void add('hourly', 60 * 60_000);
    void add('daily', 24 * 60 * 60_000);
  }
}

/**
 * Hourly per business group using Assets & Maintenance: the PM due evaluator (idempotent per due
 * instance), downtime escalation by criticality and PM reminders. Daily: warranty expiry reminders.
 * Every notification is deduplicated through the audit log so a rerun never notifies twice.
 */
@Processor(ASSETS_QUEUE)
export class AssetsProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetsProcessor.name);

  constructor(
    private readonly ctx: AmContextService,
    private readonly pm: AmPmService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const roots = await this.ctx.db.amSettings.findMany({
      select: { businessId: true },
    });
    for (const { businessId: rootId } of roots) {
      try {
        if (job.name === 'daily') await this.warranty(rootId);
        else {
          await this.pm.evaluate(rootId);
          await this.escalate(rootId);
          await this.reminders(rootId);
        }
      } catch (e) {
        this.logger.warn(
          `assets ${job.name} failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    }
  }

  private async once(rootId: string, key: string, detail: string) {
    const done = await this.ctx.db.amAudit.findFirst({
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

  /** Open downtime past the criticality's escalation threshold → notify Owner / managers / team. */
  async escalate(rootId: string) {
    const cfg = await this.ctx.config(rootId);
    const open = await this.ctx.db.amDowntime.findMany({
      where: { businessId: rootId, endAt: null, escalatedAt: null },
    });
    for (const d of open) {
      const x = await this.ctx.db.amAsset.findUnique({
        where: { id: d.assetId },
      });
      if (!x) continue;
      const rule = cfg.criticality.find((c) => c.level === x.criticality);
      if (!rule || rule.escalateHours == null || rule.escalateTo === 'None')
        continue;
      const hours = (Date.now() - d.startAt.getTime()) / 3600_000;
      if (hours < rule.escalateHours) continue;
      let to: string[] = [];
      if (rule.escalateTo === 'Owner')
        to = await this.ctx.roleUsers(rootId, [Role.owner]);
      else if (rule.escalateTo === 'Manager')
        to = await this.ctx.roleUsers(rootId, [Role.owner, Role.manager]);
      else if (x.teamId)
        to = (
          await this.ctx.db.amTeamMember.findMany({
            where: { teamId: x.teamId },
          })
        ).map((m) => m.userId);
      await this.ctx.notify(
        rootId,
        to,
        `${x.number} down ${hours.toFixed(1)} h`,
        `${x.name} · ${x.criticality} · ${d.cause}`,
        `/assets-maintenance/assets/${x.id}`,
      );
      await this.ctx.db.amDowntime.update({
        where: { id: d.id },
        data: { escalatedAt: new Date() },
      });
      await this.ctx.audit(
        rootId,
        'System',
        'Downtime escalated',
        'asset',
        x.id,
        `${x.number} · ${hours.toFixed(1)} h > ${rule.escalateHours} h → ${rule.escalateTo}`,
      );
    }
  }

  /** "N days before due" reminders from PM defaults, once per plan + due instance. */
  async reminders(rootId: string) {
    const cfg = await this.ctx.config(rootId);
    const ahead = Number(/(\d+)/.exec(cfg.pm.reminder)?.[1] ?? 3);
    const until = new Date(Date.now() + ahead * 86400000);
    const plans = await this.ctx.db.amPmPlan.findMany({
      where: {
        businessId: rootId,
        status: 'Active',
        nextDueOn: { lte: until },
      },
    });
    for (const p of plans) {
      const key = `pmrem:${this.pm.keyOf(p)}`.slice(0, 80);
      if (!(await this.once(rootId, key, `${p.number} reminder`))) continue;
      const x = await this.ctx.db.amAsset.findUnique({
        where: { id: p.assetId },
      });
      const team = p.teamId
        ? (
            await this.ctx.db.amTeamMember.findMany({
              where: { teamId: p.teamId },
            })
          ).map((m) => m.userId)
        : [];
      const owners = await this.ctx.roleUsers(rootId, [Role.owner]);
      await this.ctx.notify(
        rootId,
        [...owners, ...team, ...(p.assigneeUserId ? [p.assigneeUserId] : [])],
        `PM due: ${p.name}`,
        `${x?.number ?? ''} · due ${p.nextDueOn?.toISOString().slice(0, 10) ?? ''}`,
        '/assets-maintenance/preventive-maintenance',
      );
    }
  }

  /** Warranty ending within 30 days → one owner notification per asset and expiry date. */
  async warranty(rootId: string) {
    const soon = new Date(Date.now() + 30 * 86400000);
    const list = await this.ctx.db.amAsset.findMany({
      where: {
        businessId: rootId,
        warrantyEnd: { gte: new Date(), lte: soon },
        status: { notIn: ['Retired', 'Disposed', 'Archived'] },
      },
    });
    const owners = await this.ctx.roleUsers(rootId, [Role.owner]);
    for (const x of list) {
      const key = `wty:${x.id}:${x.warrantyEnd!.toISOString().slice(0, 10)}`;
      if (!(await this.once(rootId, key, `${x.number} warranty reminder`)))
        continue;
      await this.ctx.notify(
        rootId,
        owners,
        `Warranty ending: ${x.number}`,
        `${x.name} · ${x.warrantyProvider ?? ''} · ${x.warrantyEnd!.toISOString().slice(0, 10)}`,
        `/assets-maintenance/assets/${x.id}`,
      );
    }
  }
}
