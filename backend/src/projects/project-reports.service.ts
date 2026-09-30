import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  addDays,
  isoDay,
} from './projects-context.service';
import { ProjectsLoaderService, mondayOf } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { toCsv } from './projects.service';
import { isOpenTask, isOverdue, usDate } from './projects-metrics';

export const REPORT_KEYS = [
  'Portfolio Health',
  'Project Progress',
  'Task Completion',
  'Overdue Tasks',
  'Milestone Performance',
  'Time Utilization',
  'Billable vs Non-Billable',
  'Budget vs Actual',
  'Project Profitability',
  'Team Workload',
  'Client Approval Time',
] as const;

const FIN_REPORTS = ['Budget vs Actual', 'Project Profitability'];

interface Bar {
  label: string;
  w1: number;
  c1: string;
  w2?: number;
  c2?: string;
  hasB?: boolean;
  wb?: number;
  v: string;
}

const HBAR: Record<string, string> = {
  Healthy: '#12A150',
  Watch: '#F79009',
  'At Risk': '#F04438',
  Critical: '#912018',
  'No Data': '#D0D5DD',
};
const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

@Injectable()
export class ProjectReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async run(actor: AuthenticatedUser, key: string, scope?: string) {
    const acc = await this.perms.assert(actor, 'View reports');
    const L = await this.loader.load(actor, scope);
    const ids = await this.loader.scopeIds(actor, scope);
    const rk = (REPORT_KEYS as readonly string[]).includes(key)
      ? key
      : 'Portfolio Health';
    const P = L.projects.filter(
      (p) => !p.archivedAt && p.status !== 'Archived',
    );
    const visible = new Set(P.map((p) => p.id));
    const canFin = acc.can['View financials'];
    const biz = await this.ctx.business();
    const cur = (n: number) =>
      `${biz.currency} ${Math.round(n).toLocaleString('en-US')}`;
    const entries = (
      await this.prisma.projectTimeEntry.findMany({
        where: { businessId: { in: ids } },
      })
    ).filter((e) => visible.has(e.projectId));
    const ws = mondayOf(L.today);
    const we = addDays(ws, 6);

    let out: {
      rows: Bar[];
      legend?: Array<{ c: string; t: string }>;
      cols: string[];
      table: string[][];
      note: string;
    };
    const byP = <T>(fn: (p: (typeof P)[number]) => T) => P.map(fn);

    if (FIN_REPORTS.includes(rk) && !canFin) {
      out = {
        rows: [],
        cols: ['Report'],
        table: [['Needs the “View financials” project permission']],
        note: 'Your project role does not include financial figures.',
      };
    } else if (rk === 'Portfolio Health') {
      const hs = ['Healthy', 'Watch', 'At Risk', 'Critical', 'No Data'];
      out = {
        rows: hs.map((h) => {
          const n = P.filter((p) => p.health === h).length;
          return {
            label: h,
            w1: P.length ? (n / P.length) * 100 : 0,
            c1: HBAR[h],
            v: `${n} project${n === 1 ? '' : 's'}`,
          };
        }),
        cols: ['Health', 'Projects'],
        table: hs.map((h) => [
          h,
          String(P.filter((p) => p.health === h).length),
        ]),
        note: 'Current health label per active project.',
      };
    } else if (rk === 'Project Progress') {
      out = {
        rows: byP((p) => ({
          label: p.name,
          w1: p.progress,
          c1: '#12A150',
          v: p.progress + '%',
        })),
        cols: ['Project', 'Progress', 'Due'],
        table: byP((p) => [p.name, p.progress + '%', p.dueDate ?? '—']),
        note: 'Task-count progress method.',
      };
    } else if (rk === 'Task Completion') {
      out = {
        rows: byP((p) => {
          const t = L.tasks.filter(
            (x) => x.projectId === p.id && x.status !== 'Cancelled',
          );
          const d = t.filter((x) => x.status === 'Done').length;
          return {
            label: p.name,
            w1: t.length ? (d / t.length) * 100 : 0,
            c1: '#12A150',
            v: `${d} / ${t.length}`,
          };
        }),
        cols: ['Project', 'Done', 'Total'],
        table: byP((p) => {
          const t = L.tasks.filter(
            (x) => x.projectId === p.id && x.status !== 'Cancelled',
          );
          return [
            p.name,
            String(t.filter((x) => x.status === 'Done').length),
            String(t.length),
          ];
        }),
        note: 'All non-cancelled tasks, subtasks included.',
      };
    } else if (rk === 'Overdue Tasks') {
      const od = (pid: string) =>
        L.tasks.filter((t) => t.projectId === pid && isOverdue(t, L.today))
          .length;
      const mx = Math.max(1, ...P.map((p) => od(p.id)));
      out = {
        rows: byP((p) => ({
          label: p.name,
          w1: (od(p.id) / mx) * 100,
          c1: '#F04438',
          v: String(od(p.id)),
        })),
        cols: ['Project', 'Overdue'],
        table: byP((p) => [p.name, String(od(p.id))]),
        note: 'Open tasks past their due date as of today.',
      };
    } else if (rk === 'Milestone Performance') {
      const ms = (pid: string) =>
        L.milestones.filter((m) => m.projectId === pid);
      out = {
        rows: byP((p) => {
          const m = ms(p.id);
          const c = m.filter((x) => x.status === 'Completed').length;
          const o = m.filter(
            (x) => x.status === 'Overdue' || x.status === 'At Risk',
          ).length;
          return {
            label: p.name,
            w1: m.length ? (c / m.length) * 100 : 0,
            c1: '#12A150',
            w2: m.length ? (o / m.length) * 100 : 0,
            c2: '#F04438',
            v: `${c} done · ${o} at risk`,
          };
        }),
        legend: [
          { c: '#12A150', t: 'Completed' },
          { c: '#F04438', t: 'Overdue / at risk' },
        ],
        cols: ['Project', 'Completed', 'At risk', 'Total'],
        table: byP((p) => {
          const m = ms(p.id);
          return [
            p.name,
            String(m.filter((x) => x.status === 'Completed').length),
            String(
              m.filter((x) => x.status === 'Overdue' || x.status === 'At Risk')
                .length,
            ),
            String(m.length),
          ];
        }),
        note: 'All milestones per project.',
      };
    } else if (rk === 'Time Utilization') {
      const people = L.people.filter((p) => p.active);
      const shifts = await this.prisma.staffShift.findMany({
        where: {
          businessId: { in: ids },
          status: { not: 'cancelled' },
          startsAt: {
            gte: new Date(ws + 'T00:00:00Z'),
            lt: new Date(addDays(we, 1) + 'T00:00:00Z'),
          },
        },
        select: { staffUserId: true, startsAt: true, endsAt: true },
      });
      const cap = (id: string) =>
        shifts
          .filter((s) => s.staffUserId === id)
          .reduce(
            (a, s) => a + (s.endsAt.getTime() - s.startsAt.getTime()) / 3.6e6,
            0,
          );
      const logged = (id: string) =>
        entries
          .filter(
            (e) =>
              e.businessUserId === id &&
              e.status !== 'rejected' &&
              isoDay(e.date)! >= ws &&
              isoDay(e.date)! <= we,
          )
          .reduce((a, e) => a + e.minutes, 0) / 60;
      const rows = people.filter((p) => logged(p.id) > 0 || cap(p.id) > 0);
      out = {
        rows: rows.map((p) => {
          const c = cap(p.id);
          return {
            label: p.name,
            w1: c ? Math.min((logged(p.id) / c) * 100, 100) : 0,
            c1: '#12A150',
            v: c
              ? `${h1(logged(p.id))} / ${h1(c)} h`
              : `${h1(logged(p.id))} h · no shifts`,
          };
        }),
        cols: ['Person', 'Logged this week', 'Scheduled'],
        table: rows.map((p) => [
          p.name,
          h1(logged(p.id)) + ' h',
          cap(p.id) ? h1(cap(p.id)) + ' h' : 'No shifts',
        ]),
        note: 'Project time logged this week (excl. rejected) vs. hours scheduled in Staff shifts.',
      };
    } else if (rk === 'Billable vs Non-Billable') {
      const sum = (pid: string, b: boolean) =>
        entries
          .filter(
            (e) =>
              e.projectId === pid &&
              e.billable === b &&
              e.status !== 'rejected',
          )
          .reduce((a, e) => a + e.minutes, 0) / 60;
      out = {
        rows: byP((p) => {
          const b = sum(p.id, true);
          const n = sum(p.id, false);
          const t = Math.max(b + n, 0.0001);
          return {
            label: p.name,
            w1: (b / t) * 100 * (b + n ? 1 : 0),
            c1: '#12A150',
            w2: (n / t) * 100 * (b + n ? 1 : 0),
            c2: '#98A2B3',
            v: b + n ? `${h1(b)} / ${h1(n)} h` : 'No time',
          };
        }),
        legend: [
          { c: '#12A150', t: 'Billable' },
          { c: '#98A2B3', t: 'Non-billable' },
        ],
        cols: ['Project', 'Billable h', 'Non-billable h'],
        table: byP((p) => [p.name, h1(sum(p.id, true)), h1(sum(p.id, false))]),
        note: 'All logged entries except rejected ones.',
      };
    } else if (rk === 'Budget vs Actual') {
      out = {
        rows: byP((p) =>
          p.budget
            ? {
                label: p.name,
                w1: Math.min(((p.consumed ?? 0) / p.budget) * 100, 100),
                c1:
                  (p.consumed ?? 0) / p.budget > p.progress / 100 + 0.15
                    ? '#F04438'
                    : '#12A150',
                hasB: true,
                wb: p.progress,
                v: `${Math.round(((p.consumed ?? 0) / p.budget) * 100)}% used`,
              }
            : { label: p.name, w1: 0, c1: '#D0D5DD', v: 'No budget set' },
        ),
        legend: [
          { c: '#12A150', t: 'Budget consumed' },
          { c: '#98A2B3', t: 'Progress (thin bar)' },
        ],
        cols: ['Project', 'Budget', 'Consumed', 'Progress'],
        table: byP((p) => [
          p.name,
          p.budget ? cur(p.budget) : 'Not set',
          p.budget ? cur(p.consumed ?? 0) : '—',
          p.progress + '%',
        ]),
        note: 'Consumed = labour cost of approved time (hours × each person’s Staff hourly wage, snapshotted). Red when spend runs 15+ points ahead of progress.',
      };
    } else if (rk === 'Project Profitability') {
      const approved = (pid: string) =>
        entries.filter((e) => e.projectId === pid && e.status === 'approved');
      const val = (pid: string) =>
        approved(pid)
          .filter((e) => e.billable && e.billRateSnapshot != null)
          .reduce(
            (a, e) => a + (e.minutes / 60) * Number(e.billRateSnapshot),
            0,
          );
      const cost = (pid: string) =>
        approved(pid)
          .filter((e) => e.rateSnapshot != null)
          .reduce((a, e) => a + (e.minutes / 60) * Number(e.rateSnapshot), 0);
      const unpriced = (pid: string) =>
        approved(pid).filter(
          (e) =>
            e.rateSnapshot == null ||
            (e.billable && e.billRateSnapshot == null),
        ).length;
      const margin = (pid: string) => val(pid) - cost(pid);
      const mx = Math.max(1, ...P.map((p) => Math.max(val(p.id), cost(p.id))));
      out = {
        rows: byP((p) => {
          const v = val(p.id);
          const c = cost(p.id);
          return {
            label: p.name,
            w1: (v / mx) * 100,
            c1: '#12A150',
            hasB: c > 0,
            wb: (c / mx) * 100,
            v: !approved(p.id).length
              ? 'No approved time'
              : `${cur(margin(p.id))} margin`,
          };
        }),
        legend: [
          { c: '#12A150', t: 'Billable value (bill rates)' },
          { c: '#98A2B3', t: 'Labour cost (Staff wage rates)' },
        ],
        cols: [
          'Project',
          'Billable value',
          'Labour cost',
          'Gross margin',
          'Margin %',
          'Unpriced entries',
        ],
        table: byP((p) => {
          const v = val(p.id);
          return [
            p.name,
            cur(v),
            cur(cost(p.id)),
            cur(margin(p.id)),
            v ? Math.round((margin(p.id) / v) * 100) + '%' : '—',
            String(unpriced(p.id)),
          ];
        }),
        note: 'Approved project time only: billable hours × each person’s project bill rate, minus all hours × their Staff hourly wage. Entries without a rate are counted as unpriced, not guessed. Other expenses are not included.',
      };
    } else if (rk === 'Team Workload') {
      const w = L.workload;
      out = {
        rows: w.map((x) => ({
          label: x.name,
          w1: x.capacity ? Math.min((x.hours / x.capacity) * 100, 100) : 0,
          c1:
            x.capacity != null && x.hours > x.capacity ? '#F04438' : '#12A150',
          v: `${h1(x.hours)} h open${x.capacity != null ? ' / ' + h1(x.capacity) + ' h' : ''}`,
        })),
        cols: ['Person', 'Open estimate due this week', 'Scheduled'],
        table: w.map((x) => [
          x.name,
          h1(x.hours) + ' h',
          x.capacity != null ? h1(x.capacity) + ' h' : 'No shifts',
        ]),
        note: 'Remaining task estimates due by the end of this week. Not attendance.',
      };
    } else {
      const decided = await this.prisma.projectApproval.findMany({
        where: {
          businessId: { in: ids },
          status: { in: ['Approved', 'Rejected', 'Changes Requested'] },
          requestedAt: { not: null },
        },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      const avg = (pid: string) => {
        const l = decided.filter((a) => a.projectId === pid);
        const days = l
          .map((a) => {
            const d = a.events.find((e) =>
              /approved|rejected|changes/i.test(e.what),
            );
            return d
              ? Math.max(
                  (d.createdAt.getTime() - a.requestedAt!.getTime()) / 864e5,
                  0,
                )
              : null;
          })
          .filter((x): x is number => x != null);
        return days.length
          ? days.reduce((x, y) => x + y, 0) / days.length
          : null;
      };
      out = {
        rows: byP((p) => {
          const v = avg(p.id);
          return {
            label: p.name,
            w1: v != null ? Math.min((v / 7) * 100, 100) : 0,
            c1: '#2F4FB3',
            v: v != null ? `${h1(v)} days` : 'No decisions yet',
          };
        }),
        cols: ['Project', 'Avg days to decision'],
        table: byP((p) => {
          const v = avg(p.id);
          return [p.name, v != null ? h1(v) : '—'];
        }),
        note: 'From request sent to first client/internal decision.',
      };
    }
    void isOpenTask;
    return {
      key: rk,
      title: rk,
      note: out.note,
      rows: out.rows.map((r) => ({
        w2: 0,
        c2: 'transparent',
        hasB: false,
        wb: 0,
        ...r,
      })),
      legend: out.legend ?? [],
      cols: out.cols,
      table: out.table,
      src: `Source: Projects & Tasks records · generated ${usDate(L.today)} · branch scope: ${scope === 'all' ? 'All branches' : biz.name}`,
    };
  }

  async exportCsv(actor: AuthenticatedUser, key: string, scope?: string) {
    await this.perms.assert(actor, 'Export');
    const r = await this.run(actor, key, scope);
    return {
      filename: r.key.toLowerCase().replace(/\W+/g, '-') + '.csv',
      csv: toCsv(r.cols, r.table),
    };
  }

  async saved(actor: AuthenticatedUser) {
    const rows = await this.ctx.db.projectSavedReport.findMany({
      where: { userId: actor.sub },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.reportKey,
      chartType: r.chartType,
    }));
  }

  async save(actor: AuthenticatedUser, key: string, chartType: string) {
    await this.perms.assert(actor, 'View reports');
    const rk = (REPORT_KEYS as readonly string[]).includes(key)
      ? key
      : 'Portfolio Health';
    await this.ctx.db.projectSavedReport.upsert({
      where: {
        businessId_userId_reportKey: {
          businessId: this.ctx.businessId(),
          userId: actor.sub,
          reportKey: rk,
        },
      },
      update: { chartType: chartType === 'Table' ? 'Table' : 'Bar' },
      create: {
        businessId: this.ctx.businessId(),
        userId: actor.sub,
        reportKey: rk,
        chartType: chartType === 'Table' ? 'Table' : 'Bar',
      },
    });
    return { ok: true };
  }

  async unsave(actor: AuthenticatedUser, id: string) {
    await this.ctx.db.projectSavedReport.deleteMany({
      where: { id, userId: actor.sub },
    });
    return { ok: true };
  }
}
