import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Upload } from '../contracts/ct-files.service';
import { dayKey } from '../field-service/fs-time';
import {
  PpActor,
  PpContextService,
  notFound,
  num,
  ppErr,
} from './pp-context.service';
import { PpBridgeService } from './pp-bridge.service';
import { OfbItem, OnbItem, addDays } from './pp-data.service';
import { COURSE_TYPES, EXIT_TYPES, PP_ERRORS, RUN_FINAL } from './pp.constants';

const isDay = (s: string | undefined | null) =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nowIso = () => new Date().toISOString();
const J = (x: unknown) => x as Prisma.InputJsonValue;

/** Onboarding, offboarding, performance and training (pp-ui.js HR workflows). */
@Injectable()
export class PpHrService {
  constructor(
    private readonly ctx: PpContextService,
    private readonly bridge: PpBridgeService,
  ) {}

  private get db() {
    return this.ctx.db;
  }
  private async today(rootId: string) {
    const b = await this.ctx.business(rootId);
    return dayKey(new Date(), b.timezone || 'UTC');
  }
  private async member(rootId: string, uid: string, inactive = false) {
    const m = (await this.ctx.members(rootId, inactive)).find(
      (x) => x.id === uid,
    );
    if (!m) throw notFound('Employee');
    return m;
  }

  // ── onboarding ────────────────────────────────────────────────────────

  private async onb(a: PpActor, id: string) {
    const o = await this.db.ppOnboarding.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!o) throw notFound('Onboarding case');
    return o;
  }
  private who(
    o: { managerUserId: string | null; buddyUserId: string | null },
    owner: string,
    a: PpActor,
  ) {
    return owner === 'Manager'
      ? o.managerUserId
      : owner === 'Buddy'
        ? o.buddyUserId
        : a.userId;
  }

  async onbStart(a: PpActor, id: string) {
    this.ctx.need(a, 'onboard', 'Starting onboarding');
    const o = await this.onb(a, id);
    if (o.status !== 'Not Started')
      throw ppErr(PP_ERRORS.STATUS, `${o.number} is ${o.status}.`);
    await this.db.ppOnboarding.update({
      where: { id: o.id },
      data: { status: 'In Progress' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Onboarding started',
      'onboarding',
      o.id,
      o.number,
    );
    const cfg = await this.ctx.config(a.rootId);
    if (!cfg.tasks.projectId)
      return {
        status: 'In Progress',
        tasks: 0,
        note: 'No HR tasks project configured — tasks weren’t created.',
      };
    const t = await this.onbTasks(a, id);
    return { status: 'In Progress', tasks: t.created };
  }

  async onbTasks(a: PpActor, id: string) {
    this.ctx.need(a, 'onboard', 'Creating onboarding tasks');
    const o = await this.onb(a, id);
    const cfg = await this.ctx.config(a.rootId);
    const items = (o.items as unknown as OnbItem[]) ?? [];
    const sk = dayKey(o.startDate, 'UTC');
    const name = o.userId
      ? (await this.ctx.members(a.rootId, true)).find((m) => m.id === o.userId)
          ?.name
      : (
          await this.db.ppCandidate.findUnique({
            where: { id: o.candidateId ?? '' },
          })
        )?.name;
    let created = 0;
    for (const it of items) {
      if (it.task || it.done) continue;
      const t = await this.bridge.task(
        a,
        cfg.tasks.projectId,
        `${it.t} — ${name ?? 'new starter'}`,
        this.who(o, it.owner, a),
        addDays(sk, it.off),
        o.number,
      );
      it.task = t.number;
      it.taskId = t.id;
      created++;
    }
    await this.db.ppOnboarding.update({
      where: { id: o.id },
      data: {
        items: J(items),
        status: o.status === 'Not Started' ? 'In Progress' : o.status,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Onboarding tasks created',
      'onboarding',
      o.id,
      `${o.number} · ${created} task(s) in Projects & Tasks`,
    );
    return { created };
  }

  async onbItem(a: PpActor, id: string, idx: number, override: string) {
    this.ctx.need(a, 'onboard', 'Completing onboarding items');
    const o = await this.onb(a, id);
    const items = (o.items as unknown as OnbItem[]) ?? [];
    const it = items[idx];
    if (!it) throw notFound('Item');
    if (it.done) throw ppErr(PP_ERRORS.STATUS, 'Already done.');
    if (
      it.mand &&
      ['access', 'payroll', 'staff'].includes(it.kind) &&
      !override.trim()
    )
      throw ppErr(
        PP_ERRORS.INVALID,
        `Mandatory ${it.kind} item — it completes on its own when the ${it.kind === 'access' ? 'Staff login is active' : 'payroll profile has pay, bank and tax details'}, or give an override reason.`,
      );
    items[idx] = {
      ...it,
      done: true,
      ovr: override.trim() || null,
      doneAt: nowIso(),
    };
    const status = items.filter((x) => x.mand).every((x) => x.done)
      ? 'Completed'
      : 'In Progress';
    await this.db.ppOnboarding.update({
      where: { id: o.id },
      data: { items: J(items), status },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Onboarding item completed',
      'onboarding',
      o.id,
      `${o.number} · ${it.t}${override ? ` · override: ${override}` : ''}`,
    );
    return { status };
  }

  async onbEdit(
    a: PpActor,
    id: string,
    i: {
      managerUserId?: string | null;
      buddyUserId?: string | null;
      startDate?: string;
    },
  ) {
    this.ctx.need(a, 'onboard', 'Editing onboarding');
    const o = await this.onb(a, id);
    const members = await this.ctx.members(a.rootId);
    for (const u of [i.managerUserId, i.buddyUserId])
      if (u && !members.some((m) => m.id === u))
        throw ppErr(PP_ERRORS.INVALID, 'Pick active staff.');
    await this.db.ppOnboarding.update({
      where: { id: o.id },
      data: {
        ...(i.managerUserId !== undefined
          ? { managerUserId: i.managerUserId || null }
          : {}),
        ...(i.buddyUserId !== undefined
          ? { buddyUserId: i.buddyUserId || null }
          : {}),
        ...(isDay(i.startDate)
          ? { startDate: new Date(`${i.startDate}T00:00:00Z`) }
          : {}),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Onboarding edited',
      'onboarding',
      o.id,
      o.number,
    );
    return { ok: true };
  }

  async onbDocs(a: PpActor, id: string, text: string) {
    this.ctx.need(a, 'onboard', 'Requesting documents');
    const o = await this.onb(a, id);
    const email = o.userId
      ? (await this.ctx.members(a.rootId, true)).find((m) => m.id === o.userId)
          ?.email
      : (
          await this.db.ppCandidate.findUnique({
            where: { id: o.candidateId ?? '' },
          })
        )?.email;
    if (!email)
      throw ppErr(PP_ERRORS.INVALID, 'No email on file for this person.');
    const biz = await this.ctx.business(a.rootId);
    const sent = await this.bridge.mail(
      a.rootId,
      email,
      `${text.trim() || 'Please send us the documents we need before your start date.'}\n\nReply to this email with the documents attached.\n\n— ${a.name}, ${biz.name}`,
      'document_request',
    );
    await this.ctx.audit(
      a.rootId,
      a,
      sent.ok ? 'Onboarding documents requested' : 'Document request failed',
      'onboarding',
      o.id,
      `${o.number}${sent.ok ? '' : ` · ${sent.error}`}`,
    );
    if (!sent.ok)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        `Email couldn’t be sent (${sent.error}). Nothing was delivered.`,
        HttpStatus.BAD_GATEWAY,
      );
    return { sent: true };
  }

  /** Items complete from their owning system: Projects task Done, Staff login active, payroll profile complete. */
  async syncOnboarding(rootId: string) {
    const L = await this.db.ppOnboarding.findMany({
      where: { businessId: rootId, status: { not: 'Completed' } },
    });
    if (!L.length) return 0;
    const members = await this.ctx.members(rootId, true);
    const profs = await this.db.ppEmployee.findMany({
      where: { businessId: rootId },
    });
    const ids = L.flatMap((o) =>
      ((o.items as unknown as OnbItem[]) ?? [])
        .map((i) => i.taskId)
        .filter((x): x is string => !!x),
    );
    const tasks = await this.bridge.taskStates(ids);
    let n = 0;
    for (const o of L) {
      const items = (o.items as unknown as OnbItem[]) ?? [];
      const m = members.find((x) => x.id === o.userId);
      const p = m
        ? profs.find((x) => m.buIds.includes(x.businessUserId))
        : null;
      let ch = false;
      for (const it of items) {
        if (it.done) continue;
        const ok =
          (it.taskId && tasks.get(it.taskId) === 'Done') ||
          (it.kind === 'access' && m?.active) ||
          (it.kind === 'payroll' &&
            p &&
            p.payBasis &&
            p.bankAccountEnc &&
            p.taxStatus) ||
          (it.kind === 'staff' && !!m);
        if (ok) {
          it.done = true;
          it.doneAt = nowIso();
          ch = true;
        }
      }
      if (ch) {
        const status = items.filter((x) => x.mand).every((x) => x.done)
          ? 'Completed'
          : o.status === 'Not Started'
            ? 'Not Started'
            : 'In Progress';
        await this.db.ppOnboarding.update({
          where: { id: o.id },
          data: { items: J(items), status },
        });
        await this.ctx.audit(
          rootId,
          'System',
          'Onboarding items synced',
          'onboarding',
          o.id,
          `${o.number} · completed from owning systems`,
        );
        n++;
      }
    }
    return n;
  }

  // ── offboarding ───────────────────────────────────────────────────────

  private async ofb(a: PpActor, id: string) {
    const o = await this.db.ppOffboarding.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!o) throw notFound('Offboarding case');
    return o;
  }

  async ofbStart(
    a: PpActor,
    i: {
      userId?: string;
      exitType?: string;
      reason?: string;
      lastDay?: string;
      noticeDate?: string;
      handoverUserId?: string;
    },
  ) {
    this.ctx.need(a, 'offboard', 'Starting offboarding');
    const m = await this.member(a.rootId, i.userId ?? '');
    if (m.role === Role.owner)
      throw ppErr(
        PP_ERRORS.INVALID,
        'The business owner can’t be offboarded here.',
      );
    if (m.id === a.userId)
      throw ppErr(PP_ERRORS.INVALID, 'You can’t offboard yourself.');
    if (!EXIT_TYPES.includes(i.exitType ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the exit type.');
    if (!(i.reason ?? '').trim())
      throw ppErr(PP_ERRORS.INVALID, 'Reason required (restricted).');
    if (!isDay(i.lastDay))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the last working day.');
    if (
      await this.db.ppOffboarding.findFirst({
        where: {
          businessId: a.rootId,
          userId: m.id,
          status: { not: 'Completed' },
        },
      })
    )
      throw ppErr(
        PP_ERRORS.DUPLICATE,
        `${m.name} already has an open exit case.`,
      );
    const cfg = await this.ctx.config(a.rootId);
    const today = await this.today(a.rootId);
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'ofb', tx);
      const items: OfbItem[] = cfg.offboarding.template.map((t) => ({
        t: t.t,
        kind: t.kind,
        ref: null,
        done: false,
        mand: t.mand,
        owner: t.owner,
        verified: t.kind === 'access' ? false : undefined,
        ovr: null,
        task: null,
        taskId: null,
        doneAt: null,
      }));
      const x = await tx.ppOffboarding.create({
        data: {
          businessId: a.rootId,
          number,
          userId: m.id,
          exitType: i.exitType!,
          reason: i.reason!.trim().slice(0, 500),
          noticeDate: new Date(
            `${isDay(i.noticeDate) ? i.noticeDate : today}T00:00:00Z`,
          ),
          lastDay: new Date(`${i.lastDay}T00:00:00Z`),
          handoverUserId: i.handoverUserId || null,
          status: 'In Progress',
          items: J(items),
        },
      });
      const p = await tx.ppEmployee.findFirst({
        where: { businessUserId: { in: m.buIds } },
      });
      if (p)
        await tx.ppEmployee.update({
          where: { id: p.id },
          data: { status: 'Notice', version: { increment: 1 } },
        });
      else
        await tx.ppEmployee.create({
          data: {
            businessId: a.rootId,
            businessUserId: m.buId,
            status: 'Notice',
            inPayroll: true,
          },
        });
      await this.ctx.audit(
        a.rootId,
        a,
        'Offboarding started',
        'offboarding',
        x.id,
        `${number} · ${m.name} · ${i.exitType} · last day ${i.lastDay}`,
        { tx },
      );
      return x;
    });
    return { id: r.id, number: r.number };
  }

  async ofbAct(
    a: PpActor,
    id: string,
    act: string,
    body: { reason?: string; note?: string; runId?: string } = {},
  ) {
    this.ctx.need(a, 'offboard', 'Offboarding');
    const o = await this.ofb(a, id);
    if (o.status === 'Completed')
      throw ppErr(PP_ERRORS.STATUS, `${o.number} is completed.`);
    const items = (o.items as unknown as OfbItem[]) ?? [];
    const m = await this.member(a.rootId, o.userId, true);
    const save = async (
      label: string,
      detail: string,
      extra: Prisma.PpOffboardingUncheckedUpdateInput = {},
    ) => {
      await this.db.ppOffboarding.update({
        where: { id: o.id },
        data: { items: J(items), ...extra },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        label,
        'offboarding',
        o.id,
        `${o.number} · ${detail}`,
      );
    };
    const idx = (kind: string) =>
      items.findIndex((i) => i.kind === kind && !i.done);
    const today = await this.today(a.rootId);
    switch (act) {
      case 'tasks': {
        const cfg = await this.ctx.config(a.rootId);
        let n = 0;
        for (const it of items) {
          if (it.taskId || it.done || !['task', 'asset'].includes(it.kind))
            continue;
          const t = await this.bridge.task(
            a,
            cfg.tasks.projectId,
            `${it.t} — ${m.name}`,
            it.kind === 'task' ? (o.handoverUserId ?? a.userId) : a.userId,
            dayKey(o.lastDay, 'UTC'),
            o.number,
          );
          it.task = t.number;
          it.taskId = t.id;
          n++;
        }
        await save(
          'Offboarding tasks created',
          `${n} task(s) in Projects & Tasks`,
        );
        return { created: n };
      }
      case 'access': {
        const n = items.findIndex((i) => i.kind === 'access' && !i.verified);
        if (n < 0) throw ppErr(PP_ERRORS.STATUS, 'Access already revoked.');
        const now = dayKey(o.lastDay, 'UTC') <= today;
        if (now)
          await this.db.businessUser.updateMany({
            where: { id: { in: m.buIds } },
            data: { active: false },
          });
        items[n] = {
          ...items[n],
          done: true,
          verified: now,
          ref: now
            ? 'Staff login deactivated'
            : `Scheduled for ${dayKey(o.lastDay, 'UTC')}`,
          doneAt: nowIso(),
        };
        await save(
          now ? 'Access revoked' : 'Access revocation scheduled',
          now
            ? `${m.name}’s Staff login deactivated on every branch — history kept`
            : `deactivates automatically after ${dayKey(o.lastDay, 'UTC')}`,
        );
        return { verified: now };
      }
      case 'asset': {
        const n = idx('asset');
        if (n < 0) throw ppErr(PP_ERRORS.STATUS, 'No outstanding asset item.');
        if (!(body.note ?? '').trim())
          throw ppErr(
            PP_ERRORS.INVALID,
            'Note what was returned (Assets & Maintenance doesn’t track who holds an asset).',
          );
        items[n] = {
          ...items[n],
          done: true,
          ref: body.note!.trim().slice(0, 200),
          doneAt: nowIso(),
        };
        await save('Asset return confirmed', body.note!.trim());
        return { ok: true };
      }
      case 'final': {
        const run = await this.db.ppRun.findFirst({
          where: {
            businessId: a.rootId,
            OR: [{ id: body.runId ?? '' }, { number: body.runId ?? '' }],
            status: { not: 'Cancelled' },
          },
        });
        if (!run) throw ppErr(PP_ERRORS.INVALID, 'Pick a payroll run.');
        const n = items.findIndex((i) => i.kind === 'payroll');
        if (n >= 0)
          items[n] = {
            ...items[n],
            ref: run.number,
            done: RUN_FINAL.includes(run.status),
            doneAt: RUN_FINAL.includes(run.status) ? nowIso() : null,
          };
        await save('Final pay linked', `→ ${run.number}`, {
          finalRunId: run.id,
        });
        return { run: run.number };
      }
      case 'docs': {
        const biz = await this.ctx.business(a.rootId);
        const p = await this.db.ppEmployee.findFirst({
          where: { businessUserId: { in: m.buIds } },
        });
        const body2 = [
          `${biz.name}`,
          '',
          'TO WHOM IT MAY CONCERN',
          '',
          `This is to certify that ${m.name} worked with ${biz.name}${p?.title ? ` as ${p.title}` : ''}${p?.department ? ` in ${p.department}` : ''}${p?.startDate ? ` from ${p.startDate.toISOString().slice(0, 10)}` : ''} to ${dayKey(o.lastDay, 'UTC')}.`,
          '',
          'We wish them every success.',
          '',
          a.name,
          biz.name,
        ].join('\n');
        const doc = await this.bridge.fileDoc(a, {
          title: `Experience letter · ${m.name}`,
          type: 'Employment Document',
          linkId: o.id,
          text: { name: `experience-${m.name}`, body: body2 },
        });
        const n = idx('doc');
        if (n >= 0)
          items[n] = {
            ...items[n],
            done: true,
            ref: doc.number,
            doneAt: nowIso(),
          };
        await save('Exit document generated', doc.number);
        return { doc: doc.number };
      }
      case 'item': {
        const n = Number(body.note);
        const it = items[n];
        if (!it || it.done)
          throw ppErr(PP_ERRORS.INVALID, 'Pick an open item.');
        if (['access', 'payroll'].includes(it.kind))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Use the dedicated action for access and final pay.',
          );
        items[n] = {
          ...it,
          done: true,
          doneAt: nowIso(),
          ovr: (body.reason ?? '').trim() || null,
        };
        await save('Offboarding item completed', it.t);
        return { ok: true };
      }
      case 'complete': {
        const open = items.filter(
          (i) => i.mand && (!i.done || (i.kind === 'access' && !i.verified)),
        );
        if (open.length && !(body.reason ?? '').trim())
          throw ppErr(
            PP_ERRORS.INVALID,
            `Mandatory items still open: ${open.map((i) => i.t).join(' · ')} — give a documented override reason (audited).`,
          );
        for (const i of open) i.ovr = body.reason!.trim();
        await this.db.$transaction(async (tx) => {
          await tx.businessUser.updateMany({
            where: { id: { in: m.buIds } },
            data: { active: false },
          });
          const p = await tx.ppEmployee.findFirst({
            where: { businessUserId: { in: m.buIds } },
          });
          if (p)
            await tx.ppEmployee.update({
              where: { id: p.id },
              data: { status: 'Exited', version: { increment: 1 } },
            });
          await tx.ppOffboarding.update({
            where: { id: o.id },
            data: {
              items: J(items),
              status: 'Completed',
              completedAt: new Date(),
            },
          });
          await this.ctx.audit(
            a.rootId,
            a,
            'Offboarding completed',
            'offboarding',
            o.id,
            `${o.number} · ${m.name} · Staff login deactivated, history preserved${open.length ? ` · OVERRIDE: ${body.reason}` : ''}`,
            { tx },
          );
        });
        return { status: 'Completed' };
      }
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    }
  }

  /** Scheduled revocations run once the last working day has passed; linked final runs tick when finalized. */
  async syncOffboarding(rootId: string) {
    const L = await this.db.ppOffboarding.findMany({
      where: { businessId: rootId, status: { not: 'Completed' } },
    });
    const today = await this.today(rootId);
    const members = await this.ctx.members(rootId, true);
    let n = 0;
    for (const o of L) {
      const items = (o.items as unknown as OfbItem[]) ?? [];
      let ch = false;
      const acc = items.find(
        (i) => i.kind === 'access' && i.done && !i.verified,
      );
      if (acc && dayKey(o.lastDay, 'UTC') < today) {
        const m = members.find((x) => x.id === o.userId);
        if (m)
          await this.db.businessUser.updateMany({
            where: { id: { in: m.buIds } },
            data: { active: false },
          });
        acc.verified = true;
        acc.ref = 'Staff login deactivated';
        ch = true;
      }
      const pay = items.find((i) => i.kind === 'payroll' && !i.done);
      if (pay && o.finalRunId) {
        const r = await this.db.ppRun.findUnique({
          where: { id: o.finalRunId },
        });
        if (r && RUN_FINAL.includes(r.status)) {
          pay.done = true;
          pay.doneAt = nowIso();
          ch = true;
        }
      }
      const ids = items.map((i) => i.taskId).filter((x): x is string => !!x);
      const st = await this.bridge.taskStates(ids);
      for (const it of items)
        if (!it.done && it.taskId && st.get(it.taskId) === 'Done') {
          it.done = true;
          it.doneAt = nowIso();
          ch = true;
        }
      if (ch) {
        await this.db.ppOffboarding.update({
          where: { id: o.id },
          data: { items: J(items) },
        });
        await this.ctx.audit(
          rootId,
          'System',
          'Offboarding synced',
          'offboarding',
          o.id,
          o.number,
        );
        n++;
      }
    }
    return n;
  }

  // ── performance ───────────────────────────────────────────────────────

  async cycle(
    a: PpActor,
    i: { name?: string; start?: string; end?: string; scale?: number | string },
  ) {
    this.ctx.need(a, 'perf', 'Creating review cycles');
    if (
      !(i.name ?? '').trim() ||
      !isDay(i.start) ||
      !isDay(i.end) ||
      i.end! < i.start!
    )
      throw ppErr(
        PP_ERRORS.INVALID,
        'Name, start and end (after start) are required.',
      );
    const today = await this.today(a.rootId);
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'cycle', tx);
      const x = await tx.ppCycle.create({
        data: {
          businessId: a.rootId,
          number,
          name: i.name!.trim().slice(0, 120),
          startOn: new Date(`${i.start}T00:00:00Z`),
          endOn: new Date(`${i.end}T00:00:00Z`),
          scale: Math.max(3, Math.min(10, Number(i.scale) || 4)),
          status: i.start! <= today ? 'Active' : 'Planned',
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Review cycle created',
        'cycle',
        x.id,
        `${number} · ${x.name}`,
        { tx },
      );
      return x;
    });
    return { id: r.id, number: r.number };
  }

  async cycleAct(
    a: PpActor,
    id: string,
    act: 'close' | 'add',
    uids: string[] = [],
  ) {
    this.ctx.need(a, 'perf', 'Managing review cycles');
    const c = await this.db.ppCycle.findFirst({
      where: { businessId: a.rootId, id },
    });
    if (!c) throw notFound('Cycle');
    if (c.status === 'Closed')
      throw ppErr(PP_ERRORS.STATUS, `${c.number} is closed.`);
    if (act === 'close') {
      await this.db.ppCycle.update({
        where: { id: c.id },
        data: { status: 'Closed' },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Review cycle closed',
        'cycle',
        c.id,
        c.number,
      );
      return { ok: true };
    }
    const members = await this.ctx.members(a.rootId);
    const profs = await this.db.ppEmployee.findMany({
      where: { businessId: a.rootId },
    });
    let n = 0;
    for (const u of uids) {
      const m = members.find((x) => x.id === u);
      if (
        !m ||
        (await this.db.ppReview.findUnique({
          where: { cycleId_userId: { cycleId: c.id, userId: u } },
        }))
      )
        continue;
      const p = profs.find((x) => m.buIds.includes(x.businessUserId));
      const number = await this.ctx.number(a.rootId, 'review');
      await this.db.ppReview.create({
        data: {
          businessId: a.rootId,
          number,
          cycleId: c.id,
          userId: u,
          reviewerUserId:
            p?.managerUserId && p.managerUserId !== u
              ? p.managerUserId
              : a.userId,
          status: 'Not Started',
          goals: [],
          dev: [],
        },
      });
      n++;
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Reviews added',
      'cycle',
      c.id,
      `${c.number} · ${n} review(s)`,
    );
    return { added: n };
  }

  private async review(a: PpActor, id: string) {
    const r = await this.db.ppReview.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!r) throw notFound('Review');
    return r;
  }

  async reviewAct(
    a: PpActor,
    id: string,
    act: string,
    i: {
      txt?: string;
      rating?: string;
      dev?: string;
      goal?: string;
      weight?: number | string;
      idx?: number | string;
      p?: number | string;
    } = {},
  ) {
    const r = await this.review(a, id);
    const cfg = await this.ctx.config(a.rootId);
    const goals =
      (r.goals as unknown as { t: string; w: number; p: number }[]) ?? [];
    const upd = async (
      data: Prisma.PpReviewUncheckedUpdateInput,
      label: string,
      detail = '',
    ) => {
      await this.db.ppReview.update({ where: { id: r.id }, data });
      await this.ctx.audit(
        a.rootId,
        a,
        label,
        'review',
        r.id,
        `${r.number}${detail ? ` · ${detail}` : ''}`,
      );
    };
    switch (act) {
      case 'requestSelf':
        this.ctx.need(a, 'perf', 'Requesting self reviews');
        if (r.status !== 'Not Started')
          throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
        await upd({ status: 'Self Review' }, 'Self review requested');
        await this.ctx.notify(
          a.rootId,
          [r.userId],
          'Self review requested',
          'Write your reflection in People & Payroll › Performance',
          '/people/performance',
          a.userId,
        );
        return { status: 'Self Review' };
      case 'self':
        if (r.userId !== a.userId)
          throw ppErr(
            PP_ERRORS.FORBIDDEN,
            'PERMISSION_DENIED — only the employee writes their self review.',
            HttpStatus.FORBIDDEN,
          );
        if (!['Not Started', 'Self Review'].includes(r.status))
          throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
        if (!(i.txt ?? '').trim())
          throw ppErr(PP_ERRORS.INVALID, 'Write your reflection.');
        await upd(
          { selfText: i.txt!.trim().slice(0, 8000), status: 'Manager Review' },
          'Self review submitted',
        );
        await this.ctx.notify(
          a.rootId,
          [r.reviewerUserId],
          'Self review submitted',
          'Ready for your manager review',
          '/people/performance',
          a.userId,
        );
        return { status: 'Manager Review' };
      case 'mgr':
        if (r.reviewerUserId !== a.userId && !a.owner)
          throw ppErr(
            PP_ERRORS.FORBIDDEN,
            'PERMISSION_DENIED — only the reviewer submits the manager review.',
            HttpStatus.FORBIDDEN,
          );
        if (r.status !== 'Manager Review')
          throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
        if (
          !(i.txt ?? '').trim() ||
          !cfg.performance.ratings.includes(i.rating ?? '')
        )
          throw ppErr(PP_ERRORS.INVALID, 'Comments and a rating are required.');
        await upd(
          {
            managerText: i.txt!.trim().slice(0, 8000),
            rating: i.rating,
            status: 'Completed',
            ...(i.dev?.trim()
              ? {
                  dev: J([
                    ...((r.dev as unknown as string[]) ?? []),
                    i.dev.trim(),
                  ]),
                }
              : {}),
          },
          'Manager review submitted',
        );
        await this.ctx.notify(
          a.rootId,
          [r.userId],
          'Your review is complete',
          'Read and acknowledge it in People & Payroll › Performance',
          '/people/performance',
          a.userId,
        );
        return { status: 'Completed' };
      case 'ack':
        if (r.userId !== a.userId)
          throw ppErr(
            PP_ERRORS.FORBIDDEN,
            'PERMISSION_DENIED',
            HttpStatus.FORBIDDEN,
          );
        if (r.status !== 'Completed')
          throw ppErr(PP_ERRORS.STATUS, 'Not completed yet.');
        await upd({ acknowledged: true }, 'Review acknowledged');
        return { ok: true };
      case 'goal': {
        if (!a.perf && r.reviewerUserId !== a.userId)
          this.ctx.need(a, 'perf', 'Adding goals');
        const w = Number(i.weight);
        if (!(i.goal ?? '').trim() || !(w > 0 && w <= 100))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Goal and a weight (1–100) are required.',
          );
        if (goals.reduce((s, g) => s + g.w, 0) + w > 100)
          throw ppErr(
            PP_ERRORS.INVALID,
            'Goal weights can’t add up to more than 100%.',
          );
        await upd(
          {
            goals: J([...goals, { t: i.goal!.trim().slice(0, 200), w, p: 0 }]),
          },
          'Goal added',
          i.goal,
        );
        return { ok: true };
      }
      case 'progress': {
        if (!a.perf && r.userId !== a.userId && r.reviewerUserId !== a.userId)
          this.ctx.need(a, 'perf', 'Updating goals');
        const k = Number(i.idx);
        const p = Number(i.p);
        if (!goals[k] || !(p >= 0 && p <= 100))
          throw ppErr(
            PP_ERRORS.INVALID,
            'Pick a goal and a progress between 0 and 100.',
          );
        goals[k] = { ...goals[k], p };
        await upd(
          { goals: J(goals) },
          'Goal progress updated',
          `${goals[k].t} → ${p}%`,
        );
        return { ok: true };
      }
      case 'devtask': {
        this.ctx.need(a, 'perf', 'Creating development tasks');
        if (!(i.txt ?? '').trim())
          throw ppErr(PP_ERRORS.INVALID, 'Describe the development action.');
        const t = await this.bridge.task(
          a,
          cfg.tasks.projectId,
          i.txt!.trim(),
          r.userId,
          null,
          r.number,
        );
        await upd(
          {
            dev: J([
              ...((r.dev as unknown as string[]) ?? []),
              `${i.txt!.trim()} · ${t.number} (Projects & Tasks)`,
            ]),
          },
          'Development task created',
          t.number,
        );
        return { task: t.number };
      }
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    }
  }

  // ── training ──────────────────────────────────────────────────────────

  async course(
    a: PpActor,
    i: {
      name?: string;
      provider?: string;
      type?: string;
      roles?: string[];
      hours?: number | string;
      mode?: string;
      assessment?: boolean | string;
      skill?: string;
      validDays?: number | string | null;
    },
  ) {
    this.ctx.need(a, 'training', 'Creating training items');
    const name = (i.name ?? '').trim();
    if (!name) throw ppErr(PP_ERRORS.INVALID, 'Course name required.');
    if (!COURSE_TYPES.includes(i.type ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick a type.');
    const hours = Number(i.hours);
    if (!(hours > 0))
      throw ppErr(PP_ERRORS.INVALID, 'Duration must be more than 0 hours.');
    const valid =
      i.validDays === '' || i.validDays == null
        ? null
        : Math.round(Number(i.validDays));
    if (valid != null && !(valid > 0))
      throw ppErr(PP_ERRORS.INVALID, 'Validity must be a number of days.');
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'course', tx);
      const x = await tx.ppCourse.create({
        data: {
          businessId: a.rootId,
          number,
          name: name.slice(0, 160),
          provider: (i.provider ?? '').trim().slice(0, 120) || 'Internal',
          type: i.type!,
          roles: (i.roles ?? []).slice(0, 30),
          hours,
          mode: (i.mode ?? 'In person').slice(0, 20),
          assessment:
            i.assessment === true ||
            i.assessment === 'true' ||
            i.assessment === '1',
          skill: (i.skill ?? '').trim().slice(0, 80) || name.split(' ')[0],
          validDays: valid,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Training item created',
        'course',
        x.id,
        `${number} · ${name}`,
        { tx },
      );
      return x;
    });
    return { id: r.id, number: r.number };
  }

  async assignTraining(
    a: PpActor,
    courseId: string,
    uids: string[],
    dueDays: number,
  ) {
    this.ctx.need(a, 'training', 'Assigning training');
    const c = await this.db.ppCourse.findFirst({
      where: { businessId: a.rootId, id: courseId },
    });
    if (!c) throw notFound('Course');
    const members = await this.ctx.members(a.rootId);
    const ok = uids.filter((u) => members.some((m) => m.id === u));
    if (!ok.length) throw ppErr(PP_ERRORS.INVALID, 'Pick employees.');
    const open = await this.db.ppTraining.findMany({
      where: {
        courseId: c.id,
        userId: { in: ok },
        status: { in: ['Assigned', 'In Progress'] },
      },
      select: { userId: true },
    });
    const add = ok.filter((u) => !open.some((x) => x.userId === u));
    const today = await this.today(a.rootId);
    const due = new Date(
      `${addDays(today, Math.max(1, Math.round(dueDays) || 14))}T00:00:00Z`,
    );
    for (const u of add) {
      const number = await this.ctx.number(a.rootId, 'ta');
      await this.db.ppTraining.create({
        data: {
          businessId: a.rootId,
          number,
          courseId: c.id,
          userId: u,
          dueOn: due,
          status: 'Assigned',
        },
      });
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Training assigned',
      'course',
      c.id,
      `${c.number} → ${add.length} employee(s)${open.length ? ` · skipped ${open.length} already open` : ''}`,
    );
    await this.ctx.notify(
      a.rootId,
      add,
      `Training assigned: ${c.name}`,
      `Due ${due.toISOString().slice(0, 10)}`,
      '/people/training',
      a.userId,
    );
    return { assigned: add.length, skipped: open.length };
  }

  async assignByDept(a: PpActor, courseId: string, dueDays: number) {
    const c = await this.db.ppCourse.findFirst({
      where: { businessId: a.rootId, id: courseId },
    });
    if (!c) throw notFound('Course');
    const roles = (c.roles as unknown as string[]) ?? [];
    if (!roles.length)
      throw ppErr(
        PP_ERRORS.INVALID,
        'This course isn’t required for any department — assign people directly.',
      );
    const profs = await this.db.ppEmployee.findMany({
      where: {
        businessId: a.rootId,
        department: { in: roles },
        status: { not: 'Exited' },
      },
    });
    const members = await this.ctx.members(a.rootId);
    const uids = members
      .filter((m) => profs.some((p) => m.buIds.includes(p.businessUserId)))
      .map((m) => m.id);
    if (!uids.length)
      throw ppErr(PP_ERRORS.INVALID, `Nobody is in ${roles.join(', ')}.`);
    return this.assignTraining(a, courseId, uids, dueDays);
  }

  private async ta(a: PpActor, id: string) {
    const t = await this.db.ppTraining.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!t) throw notFound('Training assignment');
    return t;
  }

  async trAct(
    a: PpActor,
    id: string,
    act: string,
    i: { score?: number | string; note?: string } = {},
    cert: Upload | null = null,
  ) {
    const t = await this.ta(a, id);
    const c = await this.db.ppCourse.findUniqueOrThrow({
      where: { id: t.courseId },
    });
    const own = t.userId === a.userId;
    if (!own && !a.training) this.ctx.need(a, 'training', 'Updating training');
    const fileCert = async () => {
      if (!cert) return null;
      const doc = await this.bridge.fileDoc(a, {
        title: `Certificate · ${c.name}`,
        type: 'Certificate',
        linkId: t.userId,
        file: cert,
        expiresOn: c.validDays
          ? addDays(await this.today(a.rootId), c.validDays)
          : null,
      });
      return doc.id;
    };
    switch (act) {
      case 'start':
        if (t.status !== 'Assigned')
          throw ppErr(PP_ERRORS.STATUS, `${t.number} is ${t.status}.`);
        await this.db.ppTraining.update({
          where: { id: t.id },
          data: { status: 'In Progress' },
        });
        break;
      case 'complete': {
        if (!['Assigned', 'In Progress'].includes(t.status))
          throw ppErr(PP_ERRORS.STATUS, `${t.number} is ${t.status}.`);
        const score =
          i.score === '' || i.score == null ? null : Number(i.score);
        if (c.assessment && !(score != null && score >= 0 && score <= 100))
          throw ppErr(PP_ERRORS.INVALID, 'Enter the assessment score (0–100).');
        const doc = await fileCert();
        const today = await this.today(a.rootId);
        await this.db.ppTraining.update({
          where: { id: t.id },
          data: {
            status: 'Completed',
            score: c.assessment ? score : null,
            completedAt: new Date(),
            note: (i.note ?? '').slice(0, 255) || null,
            ...(doc ? { certDocId: doc } : {}),
            certExpires: c.validDays
              ? new Date(`${addDays(today, c.validDays)}T00:00:00Z`)
              : null,
          },
        });
        break;
      }
      case 'verify':
        this.ctx.need(a, 'training', 'Verifying training');
        if (t.status !== 'Completed')
          throw ppErr(PP_ERRORS.STATUS, `${t.number} is ${t.status}.`);
        if (own && !a.owner)
          throw ppErr(
            PP_ERRORS.SOD,
            'SEPARATION_OF_DUTIES — someone else verifies your training.',
          );
        await this.db.ppTraining.update({
          where: { id: t.id },
          data: { status: 'Verified', verifiedById: a.userId },
        });
        break;
      case 'cert': {
        const doc = await fileCert();
        if (!doc)
          throw ppErr(PP_ERRORS.INVALID, 'Choose the certificate file.');
        const today = await this.today(a.rootId);
        await this.db.ppTraining.update({
          where: { id: t.id },
          data: {
            certDocId: doc,
            certExpires: c.validDays
              ? new Date(`${addDays(today, c.validDays)}T00:00:00Z`)
              : t.certExpires,
          },
        });
        break;
      }
      case 'renew': {
        this.ctx.need(a, 'training', 'Renewing certifications');
        const number = await this.ctx.number(a.rootId, 'ta');
        const today = await this.today(a.rootId);
        await this.db.ppTraining.create({
          data: {
            businessId: a.rootId,
            number,
            courseId: c.id,
            userId: t.userId,
            dueOn:
              t.certExpires && dayKey(t.certExpires, 'UTC') > today
                ? t.certExpires
                : new Date(`${addDays(today, 14)}T00:00:00Z`),
            status: 'Assigned',
          },
        });
        await this.ctx.notify(
          a.rootId,
          [t.userId],
          `Renewal assigned: ${c.name}`,
          'Your certificate is due for renewal',
          '/people/training',
          a.userId,
        );
        break;
      }
      case 'remind': {
        this.ctx.need(a, 'training', 'Sending training reminders');
        const n = await this.ctx.notify(
          a.rootId,
          [t.userId],
          `Reminder: ${c.name}`,
          `Due ${t.dueOn.toISOString().slice(0, 10)}`,
          '/people/training',
          a.userId,
        );
        if (!n)
          throw ppErr(
            PP_ERRORS.INVALID,
            'They have no active Staff login to notify.',
          );
        break;
      }
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown action.');
    }
    await this.ctx.audit(
      a.rootId,
      a,
      `Training ${act}`,
      'training',
      t.id,
      `${t.number} · ${c.name}${i.score != null && i.score !== '' ? ` · ${num(i.score)}%` : ''}`,
    );
    return { ok: true };
  }

  async certLink(a: PpActor, id: string) {
    const t = await this.ta(a, id);
    if (t.userId !== a.userId && !a.training)
      this.ctx.need(a, 'training', 'Opening certificates');
    if (!t.certDocId)
      throw ppErr(
        PP_ERRORS.NOT_FOUND,
        'No certificate on file.',
        HttpStatus.NOT_FOUND,
      );
    return this.bridge.docLink(a, t.certDocId);
  }
}
