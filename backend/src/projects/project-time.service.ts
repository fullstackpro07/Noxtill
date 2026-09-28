import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  isoDay,
  parseDay,
} from './projects-context.service';
import { ProjectsLoaderService, mondayOf } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { PROJECT_ERRORS } from './projects.constants';
import { addDays } from './projects-context.service';

/**
 * Project delivery time — never attendance/shifts/payroll (those stay in Staff and are never
 * touched here). The rate is the person's Staff hourly rate, snapshotted when the entry is made.
 */
@Injectable()
export class ProjectTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  private async me(actor: AuthenticatedUser) {
    const personId = await this.ctx.actorPersonId(actor);
    if (!personId)
      throw new AppException(
        PROJECT_ERRORS.FORBIDDEN,
        'Only staff members can log project time.',
        HttpStatus.FORBIDDEN,
      );
    return personId;
  }

  async list(actor: AuthenticatedUser) {
    const L = await this.loader.load(actor);
    const visible = new Set(L.projects.map((p) => p.id));
    const canFin = L.acc.can['View financials'];
    const canApprove = L.acc.can['Approve time'];
    const personId = L.acc.personId;
    const people = new Map(L.people.map((p) => [p.id, p.name]));
    const taskNo = new Map(L.tasks.map((t) => [t.id, t.number]));
    const rows = await this.prisma.projectTimeEntry.findMany({
      where: { businessId: this.ctx.businessId() },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    const mine = (e: { businessUserId: string }) =>
      e.businessUserId === personId;
    // Without "Approve time" a person sees only their own entries.
    const seen = rows.filter(
      (e) => visible.has(e.projectId) && (canApprove || mine(e)),
    );
    const entries = seen.map((e) => ({
      id: e.id,
      number: e.number,
      personId: e.businessUserId,
      who: people.get(e.businessUserId) ?? 'Former staff',
      projectId: e.projectId,
      taskId: e.taskId,
      taskNumber: e.taskId ? (taskNo.get(e.taskId) ?? null) : null,
      date: isoDay(e.date)!,
      minutes: e.minutes,
      billable: e.billable,
      rate: canFin && e.rateSnapshot != null ? Number(e.rateSnapshot) : null,
      value:
        canFin && e.billable && e.rateSnapshot != null
          ? Math.round((e.minutes / 60) * Number(e.rateSnapshot) * 100) / 100
          : null,
      status: e.status,
      note: e.note,
      rejectReason: e.rejectReason,
      mine: mine(e),
      canSubmit: mine(e) && e.status === 'draft',
      canApprove:
        canApprove &&
        e.status === 'submitted' &&
        (!mine(e) || L.acc.role === 'Owner'),
    }));
    const today = L.today;
    const ws = mondayOf(today);
    const we = addDays(ws, 6);
    const live = entries.filter((e) => e.status !== 'rejected');
    const hrs = (list: typeof entries) =>
      Math.round((list.reduce((a, e) => a + e.minutes, 0) / 60) * 10) / 10;
    const kpis = {
      today: hrs(entries.filter((e) => e.mine && e.date === today)),
      teamWeek: hrs(live.filter((e) => e.date >= ws && e.date <= we)),
      billable: hrs(live.filter((e) => e.billable)),
      nonBillable: hrs(live.filter((e) => !e.billable)),
      pending: hrs(entries.filter((e) => e.status === 'submitted')),
      billableValue: canFin
        ? Math.round(
            entries
              .filter((e) => e.status === 'approved' && e.value != null)
              .reduce((a, e) => a + (e.value ?? 0), 0),
          )
        : null,
      ratesMissing: canFin
        ? entries.filter((e) => e.billable && e.rate == null).length
        : 0,
    };
    return { today, entries, kpis, canApprove, canSeeRates: canFin };
  }

  async timer(actor: AuthenticatedUser) {
    const personId = await this.ctx.actorPersonId(actor);
    if (!personId) return null;
    const t = await this.ctx.db.projectTimer.findUnique({
      where: {
        businessId_businessUserId: {
          businessId: this.ctx.businessId(),
          businessUserId: personId,
        },
      },
    });
    return t
      ? {
          projectId: t.projectId,
          taskId: t.taskId,
          startedAt: t.startedAt.toISOString(),
        }
      : null;
  }

  async start(
    actor: AuthenticatedUser,
    projectId: string,
    taskId?: string | null,
  ) {
    const personId = await this.me(actor);
    await this.loader.project(projectId);
    if (taskId) {
      const t = await this.prisma.projectTask.findFirst({
        where: { id: taskId, projectId },
      });
      if (!t)
        throw new AppException(
          PROJECT_ERRORS.TASK_NOT_FOUND,
          'That task is not on this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    const existing = await this.ctx.db.projectTimer.findUnique({
      where: {
        businessId_businessUserId: {
          businessId: this.ctx.businessId(),
          businessUserId: personId,
        },
      },
    });
    let saved: { minutes: number } | null = null;
    if (existing) saved = await this.stop(actor);
    await this.ctx.db.projectTimer.create({
      data: {
        businessId: this.ctx.businessId(),
        businessUserId: personId,
        projectId,
        taskId: taskId || null,
        startedAt: new Date(),
      },
    });
    return { ok: true, previousSaved: saved };
  }

  /** Stops the running timer and saves it as a Draft entry (to be submitted for approval). */
  async stop(actor: AuthenticatedUser) {
    const personId = await this.me(actor);
    const t = await this.ctx.db.projectTimer.findUnique({
      where: {
        businessId_businessUserId: {
          businessId: this.ctx.businessId(),
          businessUserId: personId,
        },
      },
    });
    if (!t)
      throw new AppException(
        PROJECT_ERRORS.TIMER_NONE,
        'No timer is running.',
        HttpStatus.CONFLICT,
      );
    const minutes = Math.max(
      1,
      Math.round((Date.now() - t.startedAt.getTime()) / 60000),
    );
    const today = await this.ctx.today();
    await this.prisma.$transaction(async (tx) => {
      await tx.projectTimer.delete({ where: { id: t.id } });
      await this.createEntry(tx, personId, {
        projectId: t.projectId,
        taskId: t.taskId,
        date: today,
        minutes,
        billable: true,
        note: 'Timer entry',
        source: 'timer',
      });
    });
    return { minutes };
  }

  async add(
    actor: AuthenticatedUser,
    input: {
      projectId: string;
      taskId?: string | null;
      date: string;
      hours: number;
      note?: string;
      billable?: boolean;
    },
  ) {
    const personId = await this.me(actor);
    await this.loader.project(input.projectId);
    const h = Number(input.hours);
    if (!(h >= 0.25) || h > 24)
      throw new AppException(
        PROJECT_ERRORS.TIME_INVALID,
        'Enter a duration between 0.25 and 24 hours.',
        HttpStatus.BAD_REQUEST,
      );
    const today = await this.ctx.today();
    parseDay(input.date);
    if (input.date > today)
      throw new AppException(
        PROJECT_ERRORS.TIME_INVALID,
        'Time can’t be logged for a future date.',
        HttpStatus.BAD_REQUEST,
      );
    if (input.taskId) {
      const t = await this.prisma.projectTask.findFirst({
        where: { id: input.taskId, projectId: input.projectId },
      });
      if (!t)
        throw new AppException(
          PROJECT_ERRORS.TASK_NOT_FOUND,
          'That task is not on this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    const e = await this.prisma.$transaction((tx) =>
      this.createEntry(tx, personId, {
        projectId: input.projectId,
        taskId: input.taskId || null,
        date: input.date,
        minutes: Math.round(h * 60),
        billable: input.billable !== false,
        note: input.note?.trim() || 'Manual entry',
        source: 'manual',
      }),
    );
    return { id: e.id, number: e.number };
  }

  private async createEntry(
    tx: Prisma.TransactionClient,
    personId: string,
    e: {
      projectId: string;
      taskId: string | null;
      date: string;
      minutes: number;
      billable: boolean;
      note: string;
      source: string;
    },
  ) {
    const bu = await tx.businessUser.findUnique({
      where: { id: personId },
      select: { hourlyRate: true },
    });
    const number = await this.ctx.nextNumber('timeSeq', tx);
    return tx.projectTimeEntry.create({
      data: {
        businessId: this.ctx.businessId(),
        number,
        businessUserId: personId,
        projectId: e.projectId,
        taskId: e.taskId,
        date: parseDay(e.date)!,
        minutes: e.minutes,
        billable: e.billable,
        rateSnapshot: bu?.hourlyRate ?? null,
        status: 'draft',
        note: e.note.slice(0, 500),
        source: e.source,
      },
    });
  }

  private async entry(id: string) {
    const e = await this.ctx.db.projectTimeEntry.findFirst({ where: { id } });
    if (!e)
      throw new AppException(
        PROJECT_ERRORS.TIME_NOT_FOUND,
        'Time entry not found',
        HttpStatus.NOT_FOUND,
      );
    return e;
  }

  async submit(actor: AuthenticatedUser, id: string) {
    const personId = await this.me(actor);
    const e = await this.entry(id);
    if (e.businessUserId !== personId)
      throw new AppException(
        PROJECT_ERRORS.FORBIDDEN,
        'You can only submit your own time.',
        HttpStatus.FORBIDDEN,
      );
    if (e.status !== 'draft')
      throw new AppException(
        PROJECT_ERRORS.TIME_STATE,
        'Only draft entries can be submitted.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.db.projectTimeEntry.update({
      where: { id },
      data: { status: 'submitted' },
    });
    const p = await this.prisma.project.findUnique({
      where: { id: e.projectId },
      select: { name: true, managerId: true },
    });
    await this.ctx.activity(
      actor,
      'time.submitted',
      `submitted ${fmtH(e.minutes)} on ${p?.name ?? ''}`,
      { projectId: e.projectId },
    );
    return { ok: true };
  }

  async decide(
    actor: AuthenticatedUser,
    ids: string[],
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    const acc = await this.perms.assert(actor, 'Approve time');
    if (decision === 'rejected' && !reason?.trim())
      throw new AppException(
        PROJECT_ERRORS.COMMENT_REQUIRED,
        'A reason is required to reject time.',
        HttpStatus.BAD_REQUEST,
      );
    let n = 0;
    for (const id of ids) {
      const e = await this.entry(id);
      if (e.status !== 'submitted') continue;
      if (e.businessUserId === acc.personId && acc.role !== 'Owner')
        throw new AppException(
          PROJECT_ERRORS.FORBIDDEN,
          'You can’t approve your own time.',
          HttpStatus.FORBIDDEN,
        );
      await this.ctx.db.projectTimeEntry.update({
        where: { id },
        data: {
          status: decision,
          rejectReason: decision === 'rejected' ? reason!.trim() : null,
          decidedById: actor.sub,
          decidedAt: new Date(),
        },
      });
      await this.ctx.auditLog(
        `project_time.${decision}`,
        'ProjectTimeEntry',
        id,
        { status: 'submitted' },
        { status: decision, reason },
      );
      if (decision === 'rejected') {
        await this.ctx.notifyPerson(
          e.businessUserId,
          null,
          {
            title: `Time entry ${e.number} rejected`,
            body: reason!.trim().slice(0, 200),
            link: '/projects/time',
          },
          undefined,
        );
      }
      n++;
    }
    const who = n === 1 ? 'a time entry' : `${n} time entries`;
    if (n)
      await this.ctx.activity(
        actor,
        decision === 'approved' ? 'time.approved' : 'time.rejected',
        `${decision} ${who}`,
        {},
      );
    return { updated: n };
  }
}

function fmtH(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ' ' + r + 'm' : ''}` : `${r}m`;
}
