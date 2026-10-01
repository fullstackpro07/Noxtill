import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  Tx,
  dayOf,
  num,
  r2,
} from './finance-context.service';
import {
  APPROVER_LABEL,
  FinancePostingService,
  JournalWithLines,
  LineInput,
  Step,
  approvalLevel,
} from './finance-posting.service';
import { FIN_ERRORS, MANUAL_TYPES } from './finance.constants';

export interface JournalDraftInput {
  date: string;
  type: string;
  reference?: string;
  memo?: string;
  currency?: string;
  branchId?: string | null;
  autoReverse?: boolean;
  lines: {
    accountId?: string | null;
    description?: string;
    debit?: number;
    credit?: number;
    department?: string | null;
    branchId?: string | null;
  }[];
}

/**
 * Manual journals and Finance approvals. Thresholds and segregation of duties come from Finance
 * settings; every decision is recorded on a FinApproval row and in the Finance audit trail.
 */
@Injectable()
export class FinanceJournalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    readonly posting: FinancePostingService,
  ) {}

  // ── approvals ────────────────────────────────────────────────────────────

  async requestApproval(
    rootId: string,
    actor: FinActor,
    a: {
      subjectType: string;
      subjectId: string;
      title: string;
      amount: number | null;
      rule: string;
      level: 'approve' | 'admin';
      payload?: Prisma.InputJsonValue;
    },
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    await db.finApproval.updateMany({
      where: {
        businessId: rootId,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
        status: 'Pending',
      },
      data: { status: 'Cancelled' },
    });
    const row = await db.finApproval.create({
      data: {
        businessId: rootId,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
        title: a.title.slice(0, 200),
        amount: a.amount,
        rule: a.rule.slice(0, 200),
        approverRole:
          a.level === 'admin' ? 'Owner/Controller' : 'Finance Manager',
        requestedById: actor.userId,
        status: 'Pending',
        payload: a.payload,
      },
    });
    await this.ctx.notify(
      rootId,
      a.level,
      'Finance approval needed',
      `${actor.name} asked for approval: ${a.title}${a.amount != null ? ` (${a.amount.toFixed(2)})` : ''}.`,
      '/finance?approvals=1',
      actor.userId,
    );
    return row;
  }

  async decide(
    rootId: string,
    subjectType: string,
    subjectId: string,
    status: 'Approved' | 'Rejected',
    actor: FinActor,
    comment?: string,
    tx?: Tx,
  ) {
    await (tx ?? this.prisma).finApproval.updateMany({
      where: { businessId: rootId, subjectType, subjectId, status: 'Pending' },
      data: {
        status,
        decidedById: actor.userId,
        decidedAt: new Date(),
        comment: comment?.slice(0, 500) ?? null,
      },
    });
  }

  async pendingApproval(
    rootId: string,
    subjectType: string,
    subjectId: string,
  ) {
    return this.prisma.finApproval.findFirst({
      where: { businessId: rootId, subjectType, subjectId, status: 'Pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** May this person decide an approval at this level, given who asked? */
  assertCanApprove(
    actor: FinActor,
    level: 'approve' | 'admin',
    requesterId: string | null,
    sodOn: boolean,
    what: string,
  ) {
    if (level === 'admin') this.ctx.need(actor, 'admin', what);
    else this.ctx.need(actor, 'approve', what);
    if (sodOn && requesterId && requesterId === actor.userId)
      throw new AppException(
        FIN_ERRORS.SOD,
        `Segregation of duties: you prepared this, so someone else has to approve it.`,
        HttpStatus.FORBIDDEN,
      );
  }

  // ── journal drafts ───────────────────────────────────────────────────────

  private async toInput(rootId: string, dto: JournalDraftInput) {
    const base = await this.ctx.baseCurrency(rootId);
    const currency = (dto.currency || base).toUpperCase();
    const date = dayOf(dto.date);
    if (Number.isNaN(date.getTime()))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Choose a journal date.',
        HttpStatus.BAD_REQUEST,
      );
    const type = MANUAL_TYPES.includes(dto.type) ? dto.type : 'Adjustment';
    const fxRate = await this.ctx.mustRate(rootId, currency, date);
    const cfg = await this.ctx.config(rootId);
    let autoReverseOn: Date | null = null;
    if (type === 'Accrual' && (dto.autoReverse ?? cfg.posting.autoRev))
      autoReverseOn = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
      );
    const lines: LineInput[] = (dto.lines ?? []).map((l) => ({
      accountId: l.accountId || null,
      description: l.description ?? null,
      debit: r2(Number(l.debit) || 0),
      credit: r2(Number(l.credit) || 0),
      department: l.department || null,
      branchId: l.branchId || dto.branchId || null,
    }));
    return {
      date,
      type,
      reference: dto.reference ?? null,
      memo: dto.memo ?? null,
      currency,
      fxRate,
      branchId: dto.branchId ?? null,
      autoReverseOn,
      lines,
    };
  }

  async createDraft(actor: FinActor, dto: JournalDraftInput) {
    this.ctx.need(actor, 'manage', 'Creating a journal');
    const input = await this.toInput(actor.rootId, dto);
    const j = await this.prisma.$transaction((tx) =>
      this.posting.create(tx, actor.rootId, {
        ...input,
        status: 'Draft',
        preparedById: actor.userId,
      }),
    );
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.created',
      'journal',
      j.id,
      `${j.number} saved as draft`,
    );
    return j;
  }

  async updateDraft(
    actor: FinActor,
    id: string,
    version: number,
    dto: JournalDraftInput,
  ) {
    this.ctx.need(actor, 'manage', 'Editing a journal');
    const input = await this.toInput(actor.rootId, dto);
    const j = await this.posting.replaceDraft(actor.rootId, id, version, input);
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.edited',
      'journal',
      id,
      `${j.number} saved as v${j.version}`,
    );
    return j;
  }

  private async mustStatus(
    rootId: string,
    id: string,
    allowed: string[],
    what: string,
  ) {
    const j = await this.posting.load(rootId, id);
    if (!allowed.includes(j.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} is ${j.status} — ${what} isn’t possible from that status.`,
        HttpStatus.CONFLICT,
      );
    return j;
  }

  private async touchesControl(rootId: string, j: JournalWithLines) {
    const ids = j.lines.map((l) => l.accountId).filter(Boolean) as string[];
    return (
      (await this.prisma.finAccount.count({
        where: { businessId: rootId, id: { in: ids }, control: { not: null } },
      })) > 0
    );
  }

  /** Validate, then route by size: under the direct-post threshold → review; above → approval. */
  async submit(
    actor: FinActor,
    id: string,
  ): Promise<{ steps: Step[]; status: string }> {
    this.ctx.need(actor, 'manage', 'Submitting a journal');
    const j = await this.mustStatus(
      actor.rootId,
      id,
      ['Draft', 'Failed'],
      'submitting',
    );
    const steps = await this.posting.validate(actor.rootId, j, actor, {
      approvalCheck: false,
    });
    const bad = steps.find((s) => !s.ok);
    if (bad)
      throw new AppException(
        FIN_ERRORS.INVALID,
        bad.d,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const cfg = await this.ctx.config(actor.rootId);
    const control = await this.touchesControl(actor.rootId, j);
    const level = approvalLevel(cfg, num(j.total), control);
    const status = level === 'none' ? 'Pending Review' : 'Approval Required';
    await this.prisma.$transaction(async (tx) => {
      await tx.finJournal.update({
        where: { id },
        data: {
          status,
          submittedAt: new Date(),
          failureReason: null,
          approvedById: null,
          approvedAt: null,
        },
      });
      if (level !== 'none')
        await this.requestApproval(
          actor.rootId,
          actor,
          {
            subjectType: 'journal',
            subjectId: id,
            title: `${j.number} · ${j.memo ?? j.type}`,
            amount: num(j.total),
            rule: control
              ? 'Journal touches a control account — Owner / Controller approval'
              : level === 'admin'
                ? `Manual journal above ${cfg.thresholds.journalOwner.toFixed(2)} — Owner / Controller approval`
                : `Manual journal ${cfg.thresholds.journalDirect.toFixed(2)} – ${cfg.thresholds.journalOwner.toFixed(2)} — Finance Manager approval`,
            level,
          },
          tx,
        );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.submitted',
      'journal',
      id,
      `${j.number} → ${status}`,
    );
    steps.push({
      k: 'route',
      l: 'Routing',
      ok: true,
      d:
        level === 'none'
          ? 'Under threshold — sent for review'
          : `Waiting on ${APPROVER_LABEL[level]}`,
    });
    return { steps, status };
  }

  async review(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Reviewing a journal');
    const j = await this.mustStatus(
      actor.rootId,
      id,
      ['Pending Review'],
      'review',
    );
    const cfg = await this.ctx.config(actor.rootId);
    if (cfg.sod.sod1 && j.preparedById === actor.userId)
      throw new AppException(
        FIN_ERRORS.SOD,
        'Segregation of duties: you prepared this journal, so someone else has to review it.',
        HttpStatus.FORBIDDEN,
      );
    await this.prisma.finJournal.update({
      where: { id },
      data: { status: 'Ready to Post' },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.reviewed',
      'journal',
      id,
      `${j.number} reviewed`,
    );
  }

  async approve(actor: FinActor, id: string, comment?: string) {
    const j = await this.mustStatus(
      actor.rootId,
      id,
      ['Approval Required'],
      'approval',
    );
    const cfg = await this.ctx.config(actor.rootId);
    const level = approvalLevel(
      cfg,
      num(j.total),
      await this.touchesControl(actor.rootId, j),
    );
    this.assertCanApprove(
      actor,
      level === 'none' ? 'approve' : level,
      j.preparedById,
      cfg.sod.sod1,
      `Approving ${j.number}`,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.finJournal.update({
        where: { id },
        data: {
          status: 'Ready to Post',
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
      });
      await this.decide(
        actor.rootId,
        'journal',
        id,
        'Approved',
        actor,
        comment,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.approved',
      'journal',
      id,
      `${j.number} approved${comment ? ` — ${comment}` : ''}`,
    );
  }

  async reject(actor: FinActor, id: string, comment: string) {
    const j = await this.mustStatus(
      actor.rootId,
      id,
      ['Approval Required', 'Pending Review', 'Ready to Post'],
      'rejection',
    );
    this.ctx.need(actor, 'approve', 'Rejecting a journal');
    await this.prisma.$transaction(async (tx) => {
      await tx.finJournal.update({
        where: { id },
        data: { status: 'Draft', approvedById: null, approvedAt: null },
      });
      await this.decide(
        actor.rootId,
        'journal',
        id,
        'Rejected',
        actor,
        comment,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.rejected',
      'journal',
      id,
      `${j.number} sent back to draft — ${comment}`,
    );
  }

  async post(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Posting a journal');
    const j = await this.mustStatus(
      actor.rootId,
      id,
      [
        'Draft',
        'Ready to Post',
        'Failed',
        'Approval Required',
        'Pending Review',
      ],
      'posting',
    );
    if (j.sourceType == null && j.status === 'Pending Review') {
      const cfg = await this.ctx.config(actor.rootId);
      if (cfg.sod.sod1 && j.preparedById === actor.userId)
        throw new AppException(
          FIN_ERRORS.SOD,
          'This journal is waiting for review by someone other than its preparer.',
          HttpStatus.FORBIDDEN,
        );
    }
    return this.posting.post(actor.rootId, id, actor);
  }

  async voidDraft(actor: FinActor, id: string, reason?: string) {
    this.ctx.need(actor, 'manage', 'Voiding a journal');
    const j = await this.mustStatus(
      actor.rootId,
      id,
      [
        'Draft',
        'Pending Review',
        'Approval Required',
        'Ready to Post',
        'Failed',
      ],
      'voiding',
    );
    if (j.sourceType)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'System journals follow their source record — change it there.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finJournal.update({ where: { id }, data: { status: 'Voided' } });
      await tx.finApproval.updateMany({
        where: {
          businessId: actor.rootId,
          subjectType: 'journal',
          subjectId: id,
          status: 'Pending',
        },
        data: { status: 'Cancelled' },
      });
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.voided',
      'journal',
      id,
      `${j.number} voided${reason ? ` — ${reason}` : ''}`,
    );
  }

  /** Mirror journal of a posted one. Under the direct-post threshold it posts now; above, it waits for approval. */
  async reverse(actor: FinActor, id: string, dateStr: string, reason: string) {
    this.ctx.need(actor, 'manage', 'Reversing a journal');
    const j = await this.mustStatus(actor.rootId, id, ['Posted'], 'reversal');
    if (
      j.sourceType &&
      !['bill', 'billpay', 'asset', 'depreciation', 'bankline', 'fx'].includes(
        j.sourceType,
      )
    )
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} was generated from ${j.sourceLabel ?? 'a source record'}. Change or cancel that record and the ledger follows automatically.`,
        HttpStatus.CONFLICT,
      );
    if (j.sourceType)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} belongs to a Finance document — void it from that document (bill, asset or bank match) so its status stays consistent.`,
        HttpStatus.CONFLICT,
      );
    const open = await this.prisma.finJournal.findFirst({
      where: {
        businessId: actor.rootId,
        reversalOfId: id,
        status: { notIn: ['Voided', 'Failed'] },
      },
    });
    if (open)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} already has reversal ${open.number} (${open.status}).`,
        HttpStatus.CONFLICT,
      );
    const date = dayOf(dateStr);
    const cfg = await this.ctx.config(actor.rootId);
    const level = approvalLevel(
      cfg,
      num(j.total),
      await this.touchesControl(actor.rootId, j),
    );
    const rev = await this.prisma.$transaction(async (tx) => {
      const r = await this.posting.createReversal(
        tx,
        actor.rootId,
        j,
        date,
        `Reversal of ${j.number} — ${reason}`,
        level === 'none' ? 'Ready to Post' : 'Approval Required',
        actor.userId,
      );
      if (level !== 'none')
        await this.requestApproval(
          actor.rootId,
          actor,
          {
            subjectType: 'journal',
            subjectId: r.id,
            title: `${r.number} · reversal of ${j.number}`,
            amount: num(j.total),
            rule: `Reversal of ${cfg.thresholds.journalDirect.toFixed(2)} or more needs ${APPROVER_LABEL[level]} approval`,
            level,
          },
          tx,
        );
      return r;
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.reversal_created',
      'journal',
      id,
      `${rev.number} reverses ${j.number} — ${reason}`,
    );
    if (level === 'none')
      return {
        reversal: rev,
        ...(await this.posting.post(actor.rootId, rev.id, actor)),
      };
    return { reversal: rev, ok: true, steps: [] as Step[], journal: rev };
  }

  async attach(
    actor: FinActor,
    id: string,
    file: { key: string; name: string; size: number; type: string },
  ) {
    const j = await this.posting.load(actor.rootId, id);
    const list = Array.isArray(j.attachments) ? j.attachments : [];
    await this.prisma.finJournal.update({
      where: { id },
      data: {
        attachments: [
          ...list,
          { ...file, by: actor.name, at: new Date().toISOString() },
        ],
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'journal.evidence_attached',
      'journal',
      id,
      file.name,
    );
  }

  /** Accruals flagged to auto-reverse: post their reversal once the date arrives. */
  async autoReversals(rootId: string) {
    const due = await this.prisma.finJournal.findMany({
      where: {
        businessId: rootId,
        status: 'Posted',
        autoReverseOn: { lte: dayOf(new Date()) },
      },
      include: { lines: true },
    });
    let n = 0;
    for (const j of due) {
      const exists = await this.prisma.finJournal.count({
        where: {
          businessId: rootId,
          reversalOfId: j.id,
          status: { notIn: ['Voided', 'Failed'] },
        },
      });
      if (exists) {
        await this.prisma.finJournal.update({
          where: { id: j.id },
          data: { autoReverseOn: null },
        });
        continue;
      }
      const date = await this.posting.openDateFrom(rootId, j.autoReverseOn!);
      const rev = await this.prisma.$transaction((tx) =>
        this.posting.createReversal(
          tx,
          rootId,
          j,
          date,
          `Automatic reversal of accrual ${j.number}`,
          'Ready to Post',
          null,
        ),
      );
      await this.prisma.finJournal.update({
        where: { id: j.id },
        data: { autoReverseOn: null },
      });
      const res = await this.posting.post(rootId, rev.id, null);
      if (res.ok) n += 1;
    }
    return n;
  }
}
