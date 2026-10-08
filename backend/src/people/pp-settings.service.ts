import { HttpStatus, Injectable } from '@nestjs/common';
import { PpActor, PpContextService, ppErr } from './pp-context.service';
import {
  LeaveType,
  OnbItemTpl,
  PP_ERRORS,
  PpConfig,
  TaxSlab,
  TaxTable,
} from './pp.constants';

const S = (x: unknown): string =>
  typeof x === 'string'
    ? x
    : typeof x === 'number' || typeof x === 'boolean'
      ? S(x)
      : '';
const yes = (v: unknown) =>
  v === true || v === 'true' || v === '1' || v === 'yes' || v === 'Yes';
const lines = (s: unknown) =>
  S(s)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const cells = (l: string) => l.split('|').map((x) => x.trim());
const KINDS = [
  'doc',
  'staff',
  'access',
  'payroll',
  'task',
  'training',
  'asset',
];

/**
 * People & Payroll settings — five sections edited from the header's More… menu. Every save is
 * versioned and audited; nothing statutory (tax slabs, contributions, leave entitlements) ships
 * built in, so each value here is what the business itself entered.
 */
@Injectable()
export class PpSettingsService {
  constructor(private readonly ctx: PpContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async view(a: PpActor) {
    const s = await this.ctx.ensure(a.rootId);
    const cfg = await this.ctx.config(a.rootId);
    const [projects, accounts] = await Promise.all([
      this.db.project.findMany({
        where: { businessId: a.user.businessId },
        select: { id: true, number: true, name: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.finAccount.findMany({
        where: {
          businessId: a.rootId,
          type: 'asset',
          isHeader: false,
          active: true,
        },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      version: s.version,
      config: cfg,
      text: {
        slabs: (
          cfg.tax.tables.find((t) => t.key === cfg.tax.activeKey)?.slabs ?? []
        )
          .map(
            (x) =>
              `${x.upTo ?? '-'} | ${Math.round(x.rate * 10000) / 100} | ${x.base}`,
          )
          .join('\n'),
        leave: cfg.leave.types
          .map((t) =>
            [
              t.key,
              t.name,
              t.entitlement ?? '-',
              t.paid ? 'yes' : 'no',
              t.sensitive ? 'yes' : 'no',
              t.allowNegative ? 'yes' : 'no',
            ].join(' | '),
          )
          .join('\n'),
        onb: cfg.onboarding.template
          .map((t) =>
            [t.ms, t.t, t.owner, t.off, t.mand ? 'yes' : 'no', t.kind].join(
              ' | ',
            ),
          )
          .join('\n'),
        ofb: cfg.offboarding.template
          .map((t) => [t.t, t.kind, t.mand ? 'yes' : 'no', t.owner].join(' | '))
          .join('\n'),
      },
      projects: projects.map((p) => ({
        v: p.id,
        t: `${p.number} · ${p.name}`,
      })),
      accounts: accounts.map((x) => ({
        v: x.code,
        t: `${x.code} · ${x.name}`,
      })),
      canEdit: a.settings || a.owner,
    };
  }

  async save(
    a: PpActor,
    section: string,
    v: Record<string, unknown>,
    expectedVersion?: number,
  ) {
    if (!a.settings && !a.owner)
      this.ctx.need(a, 'settings', 'Changing People settings');
    const s = await this.ctx.ensure(a.rootId);
    if (expectedVersion != null && Number(expectedVersion) !== s.version)
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — settings are now v${s.version}. Reload and try again; nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(a.rootId);
    const next: PpConfig = structuredClone(cfg);
    const bad = (m: string) =>
      ppErr(PP_ERRORS.INVALID, `VALIDATION_ERROR — ${m}`);
    const int = (x: unknown, lo: number, hi: number, label: string) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < lo || n > hi)
        throw bad(`${label} must be between ${lo} and ${hi}.`);
      return n;
    };
    switch (section) {
      case 'payroll': {
        const p = next.payroll;
        p.payGroup =
          S(v.payGroup ?? p.payGroup)
            .trim()
            .slice(0, 60) || 'Monthly payroll';
        p.workingDays = int(
          v.workingDays ?? p.workingDays,
          1,
          31,
          'Working days per month',
        );
        p.standardHours = int(
          v.standardHours ?? p.standardHours,
          1,
          400,
          'Standard hours per month',
        );
        p.overtimeWarnHours = int(
          v.overtimeWarnHours ?? p.overtimeWarnHours,
          0,
          400,
          'Overtime warning',
        );
        p.advanceWarnAmount =
          v.advanceWarnAmount === '' || v.advanceWarnAmount == null
            ? null
            : int(v.advanceWarnAmount, 0, 1e12, 'Advance warning amount');
        p.payDay = int(v.payDay ?? p.payDay, 0, 31, 'Pay day');
        p.separationOfDuties =
          v.separationOfDuties === undefined
            ? p.separationOfDuties
            : yes(v.separationOfDuties);
        p.costCenter = S(v.costCenter ?? p.costCenter).slice(0, 60);
        const code = S(v.paidFromCode ?? p.paidFromCode ?? '').trim();
        if (code) {
          const acc = await this.db.finAccount.findFirst({
            where: { businessId: a.rootId, code },
          });
          if (!acc)
            throw bad(
              `Finance account ${code} doesn’t exist in your chart of accounts.`,
            );
        }
        p.paidFromCode = code || null;
        p.departments = [
          ...new Set(
            S(v.departments ?? p.departments.join(', '))
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ].slice(0, 60);
        break;
      }
      case 'tax': {
        const key = S(v.key ?? '').trim();
        if (!key && !lines(v.slabs).length) {
          next.tax.activeKey = null;
          break;
        }
        if (!/^[\w .()-]{2,40}$/.test(key))
          throw bad(
            'Give the tax table a name (2–40 characters), e.g. “Income tax 2026-27”.',
          );
        if (!/^\d{4}-\d{2}-\d{2}$/.test(S(v.effectiveFrom ?? '')))
          throw bad('Pick the effective date.');
        const slabs: TaxSlab[] = lines(v.slabs).map((l, i) => {
          const [up, rate, base] = cells(l);
          const upTo = up === '-' || up === '' ? null : Number(up);
          const r = Number(rate) / 100;
          const b = Number(base || 0);
          if ((upTo != null && !(upTo > 0)) || !(r >= 0 && r <= 1) || !(b >= 0))
            throw bad(
              `slab line ${i + 1} — use “annual upper limit | rate % | fixed tax below this slab”, with “-” for no upper limit.`,
            );
          return { upTo, rate: r, base: b };
        });
        if (!slabs.length) throw bad('Add at least one slab.');
        const sorted = [...slabs].sort(
          (x, y) => (x.upTo ?? Infinity) - (y.upTo ?? Infinity),
        );
        if (
          sorted.filter((x) => x.upTo == null).length !== 1 ||
          sorted[sorted.length - 1].upTo != null
        )
          throw bad(
            'Exactly one slab must have no upper limit (“-”), and it must be the top slab.',
          );
        const mult = Number(v.nonFilerMultiplier ?? 1);
        if (!(mult >= 1 && mult <= 5))
          throw bad('Non-filer multiplier must be between 1 and 5.');
        const prev = next.tax.tables.find((t) => t.key === key);
        const changed =
          !prev ||
          JSON.stringify(prev.slabs) !== JSON.stringify(sorted) ||
          prev.nonFilerMultiplier !== mult ||
          prev.effectiveFrom !== v.effectiveFrom;
        const table: TaxTable = {
          key,
          version: prev ? prev.version + (changed ? 1 : 0) : 1,
          effectiveFrom: S(v.effectiveFrom),
          slabs: sorted,
          nonFilerMultiplier: mult,
          source: S(v.source ?? prev?.source ?? '').slice(0, 200),
        };
        next.tax.tables = [
          ...next.tax.tables.filter((t) => t.key !== key),
          table,
        ];
        next.tax.activeKey = key;
        break;
      }
      case 'leave': {
        const types: LeaveType[] = lines(v.types).map((l, i) => {
          const [key, name, ent, paid, sens, neg] = cells(l);
          if (!/^[a-z0-9_]{2,20}$/.test(key ?? ''))
            throw bad(
              `leave line ${i + 1} — key must be 2–20 lowercase letters/digits/underscores.`,
            );
          if (!name) throw bad(`leave line ${i + 1} — add a name.`);
          const e =
            ent === '-' || ent === '' || ent == null ? null : Number(ent);
          if (e != null && !(e >= 0 && e <= 366))
            throw bad(
              `leave line ${i + 1} — entitlement must be 0–366 days or “-”.`,
            );
          return {
            key,
            name: name.slice(0, 40),
            entitlement: e,
            paid: yes(paid),
            sensitive: yes(sens),
            allowNegative: yes(neg),
          };
        });
        if (new Set(types.map((t) => t.key)).size !== types.length)
          throw bad('Each leave type key must be unique.');
        const removed = cfg.leave.types.filter(
          (t) => !types.some((x) => x.key === t.key),
        );
        if (removed.length) {
          const group = await this.ctx.branches(a.rootId);
          const used = await this.db.timeOff.findFirst({
            where: {
              businessId: { in: group.map((g) => g.id) },
              leaveType: { in: removed.map((t) => t.key) },
            },
            select: { leaveType: true },
          });
          if (used)
            throw bad(
              `“${used.leaveType}” is used by existing leave requests and can’t be removed — rename it instead.`,
            );
        }
        next.leave.types = types;
        next.leave.yearStartMonth = int(
          v.yearStartMonth ?? next.leave.yearStartMonth,
          1,
          12,
          'Leave year start month',
        );
        break;
      }
      case 'recruit': {
        const r = next.recruiting;
        const appr = S(v.offerApproverUserId ?? '').trim();
        if (
          appr &&
          !(await this.ctx.members(a.rootId)).some((m) => m.id === appr)
        )
          throw bad('Offer approver must be active staff.');
        r.offerApproverUserId = appr || null;
        r.jobApprovalRequired =
          v.jobApprovalRequired === undefined
            ? r.jobApprovalRequired
            : yes(v.jobApprovalRequired);
        r.hideFeedbackUntilSubmitted =
          v.hideFeedbackUntilSubmitted === undefined
            ? r.hideFeedbackUntilSubmitted
            : yes(v.hideFeedbackUntilSubmitted);
        const comp = S(v.competencies ?? r.competencies.join(', '))
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (comp.length < 1 || comp.length > 8)
          throw bad('Use 1–8 job-related competencies.');
        if (comp.join() !== r.competencies.join()) {
          const done = await this.db.ppInterview.findFirst({
            where: { businessId: a.rootId, status: 'Scheduled' },
          });
          if (done)
            throw bad(
              'Competencies can’t change while interviews are scheduled — scorecards must use the same criteria.',
            );
        }
        r.competencies = comp;
        r.careersEnabled =
          v.careersEnabled === undefined
            ? r.careersEnabled
            : yes(v.careersEnabled);
        r.careersIntro = S(v.careersIntro ?? r.careersIntro).slice(0, 1000);
        r.retentionMonths = int(
          v.retentionMonths ?? r.retentionMonths,
          1,
          120,
          'Candidate retention',
        );
        if (!r.careersEnabled)
          await this.db.ppJob.updateMany({
            where: { businessId: a.rootId, status: 'Published' },
            data: { status: 'Open', publishedAt: null },
          });
        break;
      }
      case 'onb': {
        const pid = S(v.projectId ?? '').trim();
        if (
          pid &&
          !(await this.db.project.findFirst({
            where: { id: pid, businessId: a.user.businessId },
          }))
        )
          throw bad('Pick a project in this branch.');
        next.tasks.projectId = pid || null;
        if (v.onb !== undefined) {
          const t: OnbItemTpl[] = lines(v.onb).map((l, i) => {
            const [ms, task, owner, off, mand, kind] = cells(l);
            if (
              !ms ||
              !task ||
              !owner ||
              !Number.isFinite(Number(off)) ||
              !KINDS.includes(kind ?? '')
            )
              throw bad(
                `onboarding line ${i + 1} — “milestone | task | owner | days from start | mandatory yes/no | kind (${KINDS.join('/')})”.`,
              );
            return {
              ms: ms.slice(0, 30),
              t: task.slice(0, 120),
              owner: owner.slice(0, 30),
              off: Math.round(Number(off)),
              mand: yes(mand),
              kind,
            };
          });
          if (!t.length) throw bad('Keep at least one onboarding item.');
          next.onboarding.template = t;
        }
        if (v.ofb !== undefined) {
          const t = lines(v.ofb).map((l, i) => {
            const [task, kind, mand, owner] = cells(l);
            if (!task || !KINDS.includes(kind ?? '') || !owner)
              throw bad(
                `offboarding line ${i + 1} — “task | kind (${KINDS.join('/')}) | mandatory yes/no | owner”.`,
              );
            return {
              t: task.slice(0, 120),
              kind,
              mand: yes(mand),
              owner: owner.slice(0, 30),
            };
          });
          if (!t.some((x) => x.kind === 'access'))
            throw bad('Offboarding must keep an access item.');
          next.offboarding.template = t;
        }
        if (v.ratings !== undefined) {
          const r = S(v.ratings)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          if (r.length < 2 || r.length > 10)
            throw bad('Use 2–10 rating labels.');
          next.performance.ratings = r;
        }
        break;
      }
      default:
        throw bad('Unknown settings section.');
    }
    const changed = Object.keys(next).filter(
      (k) =>
        JSON.stringify((next as unknown as Record<string, unknown>)[k]) !==
        JSON.stringify((cfg as unknown as Record<string, unknown>)[k]),
    );
    if (!changed.length) return { version: s.version, changed: [] };
    const version = await this.ctx.saveConfig(a, next, changed);
    return { version, changed };
  }
}
