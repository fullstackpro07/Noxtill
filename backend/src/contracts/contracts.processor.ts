import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { CtContextService } from './ct-context.service';
import { CtEsignService } from './ct-esign.service';
import { CT_QUEUE, CT_T, LIVE, daysOf } from './ct.constants';

@Injectable()
export class ContractsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ContractsScheduler.name);

  constructor(@InjectQueue(CT_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    void this.queue
      .add(
        'hourly',
        {},
        {
          repeat: { every: 60 * 60_000 },
          jobId: 'contracts-hourly',
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
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Hourly per business using Contracts: signature deadlines & reminders, contract lifecycle by date
 * (Active → Expiring → Expired, or the auto-renew extension), archiving ended contracts when the
 * retention policy says so, and one notice per renewal / notice / obligation / compliance milestone
 * (deduplicated through CtIdem so a rerun never repeats).
 */
@Processor(CT_QUEUE)
export class ContractsProcessor extends WorkerHost {
  private readonly logger = new Logger(ContractsProcessor.name);

  constructor(
    private readonly ctx: CtContextService,
    private readonly esign: CtEsignService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const roots = await this.ctx.db.ctSettings.findMany({
      select: { businessId: true },
    });
    for (const { businessId } of roots) {
      try {
        await this.run(businessId);
      } catch (e) {
        this.logger.warn(
          `contracts hourly failed for ${businessId}: ${(e as Error).message}`,
        );
      }
    }
  }

  /** True the first time a key is seen for this business. */
  private async first(rootId: string, key: string) {
    try {
      await this.ctx.db.ctIdem.create({
        data: { businessId: rootId, key: key.slice(0, 120), status: 'done' },
      });
      return true;
    } catch {
      return false;
    }
  }

  async run(rootId: string) {
    const db = this.ctx.db;
    const cfg = await this.ctx.config(rootId);
    const sig = await this.esign.sweep(rootId);
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    );
    const off = (d: Date) => Math.round((d.getTime() - today.getTime()) / DAY);
    let moved = 0;
    const cts = await db.ctContract.findMany({
      where: {
        businessId: rootId,
        status: { in: [...LIVE, 'Expired', 'Terminated', 'Renewed'] },
      },
      include: { obls: true },
    });
    for (const c of cts) {
      if (!c.endOn) continue;
      const left = off(c.endOn);
      const go = async (
        to: string,
        why: string,
        extra: Record<string, unknown> = {},
      ) => {
        if (!(CT_T[c.status] ?? []).includes(to)) return;
        const n = await db.ctContract.updateMany({
          where: { id: c.id, status: c.status },
          data: { status: to, version: { increment: 1 }, ...extra },
        });
        if (n.count) {
          moved++;
          await this.ctx.audit(
            rootId,
            'System',
            'Contract status changed',
            'contract',
            c.id,
            `${c.number}: ${c.status} → ${to} · ${why}`,
          );
        }
      };
      if (LIVE.includes(c.status) && left < 0) {
        if (
          c.autoRenew &&
          !['Will Not Renew', 'Renewal Draft'].includes(c.renewState ?? '')
        ) {
          const term = Math.max(
            1,
            Math.round((c.endOn.getTime() - c.startOn.getTime()) / DAY),
          );
          let end = c.endOn;
          while (end < today) end = new Date(end.getTime() + term * DAY);
          await db.ctContract.update({
            where: { id: c.id },
            data: {
              endOn: end,
              status: 'Active',
              renewState: null,
              snoozedUntil: null,
              renewNote: `Auto-renewed per clause until ${iso(end)}`,
              version: { increment: 1 },
            },
          });
          if (c.docId)
            await db.ctDocument.update({
              where: { id: c.docId },
              data: { expiresOn: end },
            });
          await this.ctx.audit(
            rootId,
            'System',
            'Contract auto-renewed',
            'contract',
            c.id,
            `${c.number}: ${iso(c.endOn)} → ${iso(end)} (auto-renew, ${term}-day term; no non-renewal decision recorded)`,
          );
          await this.ctx.notify(
            rootId,
            [c.ownerId],
            `${c.number} auto-renewed`,
            `${c.title} now runs to ${iso(end)}.`,
            `/contracts/${c.number}`,
          );
          moved++;
          continue;
        }
        await go('Expired', `end date ${iso(c.endOn)} passed`);
        if (cfg.notify.expiry)
          await this.ctx.notify(
            rootId,
            [c.ownerId],
            `${c.number} expired`,
            `${c.title} ended ${iso(c.endOn)}.`,
            `/contracts/${c.number}`,
          );
        continue;
      }
      if (c.status === 'Active' && left <= cfg.contract.expiringDays)
        await go(
          'Expiring',
          `ends ${iso(c.endOn)} (within ${cfg.contract.expiringDays} days)`,
        );
      if (
        cfg.retention.archive === 'Archive when expired' &&
        ['Expired', 'Terminated', 'Renewed'].includes(c.status) &&
        off(c.terminatedOn ?? c.endOn) < -30
      )
        await go(
          'Archived',
          'ended over 30 days ago — Settings › Retention archives ended contracts',
        );
      if (
        LIVE.includes(c.status) &&
        cfg.notify.renewal &&
        !['Renewed', 'Will Not Renew', 'Renewal Draft'].includes(
          c.renewState ?? '',
        )
      )
        for (const r of cfg.contract.renewal) {
          const n = daysOf(r);
          if (
            left <= n &&
            left >= 0 &&
            (await this.first(rootId, `rn:${c.id}:${iso(c.endOn)}:${n}`))
          ) {
            await this.ctx.notify(
              rootId,
              [c.ownerId],
              `Renewal due · ${c.number}`,
              `${c.title} ends ${iso(c.endOn)} (${left} days). Decide: renew, let it ${c.autoRenew ? 'auto-renew' : 'expire'}, or mark will not renew.`,
              `/contracts/${c.number}`,
            );
            break;
          }
        }
      const nb = new Date(c.endOn.getTime() - c.noticeDays * DAY);
      if (
        LIVE.includes(c.status) &&
        cfg.notify.renewal &&
        !['Renewed', 'Will Not Renew', 'Renewal Draft'].includes(
          c.renewState ?? '',
        )
      )
        for (const r of cfg.contract.notice) {
          const n = daysOf(r);
          if (
            off(nb) <= n &&
            off(nb) >= 0 &&
            (await this.first(rootId, `nt:${c.id}:${iso(nb)}:${n}`))
          ) {
            await this.ctx.notify(
              rootId,
              [c.ownerId],
              `Notice deadline · ${c.number}`,
              `Notice for ${c.title} must be given by ${iso(nb)} (${off(nb)} days).`,
              `/contracts/${c.number}`,
            );
            break;
          }
        }
      for (const o of c.obls.filter(
        (x) => x.status === 'Upcoming' && off(x.dueOn) < 0,
      ))
        if (await this.first(rootId, `ob:${o.id}:${iso(o.dueOn)}`))
          await this.ctx.notify(
            rootId,
            [o.ownerId],
            `Obligation overdue · ${c.number}`,
            `${o.title} was due ${iso(o.dueOn)}.`,
            `/contracts/${c.number}`,
          );
    }
    if (cfg.notify.expiry) {
      const comp = await db.ctCompliance.findMany({
        where: {
          businessId: rootId,
          archivedAt: null,
          expiresOn: { not: null },
        },
      });
      for (const x of comp) {
        const left = off(x.expiresOn!);
        if (
          left <= 30 &&
          (await this.first(rootId, `cx:${x.id}:${iso(x.expiresOn!)}`))
        )
          await this.ctx.notify(
            rootId,
            [x.ownerId],
            `${left < 0 ? 'Expired' : 'Expiring'} · ${x.title}`,
            `${x.number} ${left < 0 ? 'expired' : 'expires'} ${iso(x.expiresOn!)} — upload the replacement evidence.`,
            '/contracts/compliance',
          );
      }
    }
    return { ...sig, moved };
  }
}
