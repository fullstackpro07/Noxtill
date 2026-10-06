import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CtActor,
  CtContextService,
  Tx,
  ctErr,
  notFound,
} from './ct-context.service';
import { CT_ERRORS, CT_T, CtConfig } from './ct.constants';
import type { Step } from './ct-data.service';

export type AprKind = 'Contract' | 'Document' | 'Template' | 'Amendment';
const OPEN = ['Pending', 'Escalated'];
const DECISION: Record<string, string> = {
  Approve: 'Approved',
  Reject: 'Rejected',
  'Request changes': 'Changes Requested',
  Delegate: 'Delegated',
  Escalate: 'Escalated',
};

/**
 * Approvals run natively in Contracts (Automations & Workflows only supports messaging actions, so it
 * can't hold a multi-step approval). Steps are resolved to real people from Settings › Approvals;
 * a step with nobody configured falls back to the business Owner. Four-eyes is enforced here.
 */
@Injectable()
export class CtApprovalsService {
  constructor(private readonly ctx: CtContextService) {}

  private get db() {
    return this.ctx.db;
  }

  /** The person behind a role, from Settings › Approvals (falls back to the first Owner). */
  async who(
    rootId: string,
    cfg: CtConfig,
    role: string,
    contractOwnerId?: string | null,
  ) {
    const owners = await this.ctx.ownerIds(rootId);
    const pick: Record<string, string | null | undefined> = {
      'Contract Owner': contractOwnerId,
      'Contract Manager': cfg.contract.ownerId,
      Finance: cfg.approvals.financeUserId,
      HR: cfg.approvals.hrUserId,
      'Legal/Compliance': cfg.approvals.legalUserId,
      'Authorized Signatory': cfg.approvals.signatoryUserId,
      Owner: null,
    };
    const members = await this.ctx.members(rootId);
    const id = pick[role];
    return id && members.some((m) => m.id === id) ? id : (owners[0] ?? null);
  }

  /** Contract / renewal / amendment route: owner → finance above threshold → HR for employment → signatory. */
  contractRoles(cfg: CtConfig, value: number | null, type: string) {
    return [
      'Contract Owner',
      ...((value ?? 0) > cfg.approvals.threshold ? ['Finance'] : []),
      ...(type === 'Employment Contract' && cfg.approvals.employmentHr
        ? ['HR']
        : []),
      'Authorized Signatory',
    ];
  }

  templateRoles(policy: string) {
    if (policy === 'None') return [];
    if (policy === 'Owner') return ['Owner'];
    return policy.split('→').map((x) => x.trim());
  }

  async start(
    a: CtActor,
    o: {
      kind: AprKind;
      entityId: string;
      type: string;
      roles: string[];
      ownerId?: string | null;
      reason: string;
      changes: string;
      label: string;
      link: string;
    },
    tx?: Tx,
  ) {
    const cfg = await this.ctx.config(a.rootId);
    const db = tx ?? this.db;
    const open = await db.ctApproval.findFirst({
      where: {
        businessId: a.rootId,
        entityId: o.entityId,
        status: { in: OPEN },
      },
    });
    if (open)
      throw ctErr(
        CT_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — ${open.number} is already running for this record.`,
        HttpStatus.CONFLICT,
      );
    const steps: Step[] = [];
    for (const role of o.roles)
      steps.push({
        role,
        userId: await this.who(a.rootId, cfg, role, o.ownerId),
        status: 'Waiting',
        at: null,
      });
    // The submitter's own Contract Owner step is their submission — recorded as approved, not skipped silently.
    if (steps[0]?.role === 'Contract Owner' && steps[0].userId === a.userId)
      Object.assign(steps[0], {
        status: 'Approved',
        at: new Date().toISOString(),
        comment: 'Submitted by the contract owner',
      });
    const next = steps.find((s) => s.status === 'Waiting');
    if (next) next.status = 'Pending';
    const number = await this.ctx.number(a.rootId, 'apr', tx);
    const due = new Date(Date.now() + cfg.approvals.dueDays * 86400000);
    const apr = await db.ctApproval.create({
      data: {
        businessId: a.rootId,
        number,
        kind: o.kind,
        entityId: o.entityId,
        type: o.type,
        steps: steps,
        requestedById: a.userId,
        dueOn: new Date(due.toISOString().slice(0, 10)),
        status: next ? 'Pending' : 'Approved',
        reason: (o.reason || `Standard ${o.kind.toLowerCase()} approval`).slice(
          0,
          500,
        ),
        changes: o.changes.slice(0, 255),
        comments: [],
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Approval requested',
      'approval',
      apr.id,
      `${number} · ${o.label} · ${steps.map((s) => s.role).join(' → ')}`,
      { tx },
    );
    if (next?.userId && cfg.notify.approval)
      await this.ctx.notify(
        a.rootId,
        [next.userId],
        `Approval needed · ${o.label}`,
        `${o.type} — ${next.role} step (${number})`,
        '/contracts/approvals',
        a.userId,
      );
    return apr;
  }

  async decide(
    a: CtActor,
    id: string,
    dec: string,
    comment: string,
    toUserId: string | null,
  ) {
    this.ctx.need(a, 'approve', 'Deciding approvals');
    const cfg = await this.ctx.config(a.rootId);
    const apr = await this.db.ctApproval.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!apr) throw notFound('Approval');
    if (!OPEN.includes(apr.status))
      throw ctErr(
        CT_ERRORS.STATUS,
        `INVALID_STATUS_TRANSITION — ${apr.number} is ${apr.status}.`,
      );
    const steps = apr.steps as unknown as Step[];
    const idx = steps.findIndex((s) => OPEN.includes(s.status));
    const cs = steps[idx];
    if (!DECISION[dec]) throw ctErr(CT_ERRORS.INVALID, 'Choose a decision.');
    if (
      cfg.approvals.fourEyes &&
      apr.requestedById === a.userId &&
      dec === 'Approve'
    )
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — four-eyes control: you requested this approval, so you can’t approve it. Delegate the step instead.',
        HttpStatus.FORBIDDEN,
      );
    if (cs.userId !== a.userId && !a.owner)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        `PERMISSION_DENIED — this step is assigned to ${(await this.ctx.members(a.rootId)).find((m) => m.id === cs.userId)?.name ?? 'someone else'}.`,
        HttpStatus.FORBIDDEN,
      );
    if (['Reject', 'Request changes'].includes(dec) && !comment.trim())
      throw ctErr(CT_ERRORS.INVALID, 'Add a comment explaining the decision.');
    const members = await this.ctx.members(a.rootId);
    if (
      dec === 'Delegate' &&
      (!toUserId || !members.some((m) => m.id === toUserId))
    )
      throw ctErr(CT_ERRORS.INVALID, 'Choose who to delegate to.');
    if (
      dec === 'Delegate' &&
      toUserId === apr.requestedById &&
      cfg.approvals.fourEyes
    )
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — four-eyes control: the requester can’t take over an approval step.',
        HttpStatus.FORBIDDEN,
      );
    const at = new Date().toISOString();
    let status = apr.status;
    let notifyId: string | null = null;
    if (dec === 'Approve') {
      Object.assign(cs, { status: 'Approved', at, comment: comment || null });
      const nx = steps[idx + 1];
      if (nx) {
        nx.status = 'Pending';
        notifyId = nx.userId;
        status = 'Pending';
      } else status = 'Approved';
    } else if (dec === 'Delegate') {
      Object.assign(cs, {
        userId: toUserId,
        status: 'Pending',
        comment: `Delegated by ${a.name}${comment ? ` — ${comment}` : ''}`,
      });
      notifyId = toUserId;
      status = 'Pending';
    } else if (dec === 'Escalate') {
      const owner = (await this.ctx.ownerIds(a.rootId))[0] ?? cs.userId;
      Object.assign(cs, {
        userId: owner,
        status: 'Escalated',
        comment: comment || null,
      });
      notifyId = owner;
      status = 'Escalated';
    } else {
      Object.assign(cs, { status: DECISION[dec], at, comment });
      status = DECISION[dec];
    }
    const comments = [
      ...((apr.comments as {
        t: string;
        by: string;
        at: string;
        dec: string;
      }[]) ?? []),
      { t: comment || dec, by: a.name, at, dec },
    ];
    const out = await this.db.$transaction(async (tx) => {
      const n = await tx.ctApproval.updateMany({
        where: { id: apr.id, updatedAt: apr.updatedAt },
        data: {
          steps: steps,
          status,
          comments: comments,
        },
      });
      if (!n.count)
        throw ctErr(
          CT_ERRORS.CONFLICT,
          'VERSION_CONFLICT — someone decided this step a moment ago. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      const msg = await this.apply(
        a,
        apr.kind as AprKind,
        apr.entityId,
        status,
        tx,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Approval decision',
        'approval',
        apr.id,
        `${apr.number} · ${cs.role}: ${dec}${dec === 'Delegate' ? ` → ${members.find((m) => m.id === toUserId)?.name}` : ''}${comment ? ` · ${comment}` : ''}${msg ? ` · ${msg}` : ''}`,
        { tx },
      );
      return msg;
    });
    if (notifyId && cfg.notify.approval)
      await this.ctx.notify(
        a.rootId,
        [notifyId],
        `Approval needed · ${apr.type}`,
        `${apr.number} — your step is now pending`,
        '/contracts/approvals',
        a.userId,
      );
    if (
      ['Approved', 'Rejected', 'Changes Requested'].includes(status) &&
      cfg.notify.approval
    )
      await this.ctx.notify(
        a.rootId,
        [apr.requestedById],
        `${apr.number} ${status.toLowerCase()}`,
        `${apr.type}${comment ? ` — ${comment}` : ''}`,
        '/contracts/approvals',
        a.userId,
      );
    return { status, message: out || `${cs.role} step: ${DECISION[dec]}.` };
  }

  /** Final effect of a decision on the record it governs. */
  private async apply(
    a: CtActor,
    kind: AprKind,
    entityId: string,
    status: string,
    tx: Tx,
  ): Promise<string> {
    const back = ['Rejected', 'Changes Requested'].includes(status);
    if (kind === 'Contract') {
      const c = await tx.ctContract.findUnique({ where: { id: entityId } });
      if (!c) return '';
      if (status === 'Approved' && CT_T[c.status]?.includes('Approved')) {
        await tx.ctContract.update({
          where: { id: c.id },
          data: {
            status: 'Approved',
            aprState: 'Approved',
            version: { increment: 1 },
          },
        });
        if (c.docId) {
          // The approved text is what gets signed — lock the current version.
          await tx.ctDocument.update({
            where: { id: c.docId },
            data: { status: 'Approved' },
          });
          const v = await tx.ctDocVersion.findFirst({
            where: { docId: c.docId },
            orderBy: { version: 'desc' },
          });
          if (v)
            await tx.ctDocVersion.update({
              where: { id: v.id },
              data: { state: 'Approved', immutable: true },
            });
        }
        return `${c.number} approved — ready to send for signature.`;
      }
      if (back) {
        await tx.ctContract.update({
          where: { id: c.id },
          data: {
            status: 'Draft',
            aprState: status,
            version: { increment: 1 },
          },
        });
        if (c.docId)
          await tx.ctDocument.update({
            where: { id: c.docId },
            data: { status: 'Draft' },
          });
        return `${c.number} back to Draft — ${status.toLowerCase()}.`;
      }
      if (status === 'Escalated')
        await tx.ctContract.update({
          where: { id: c.id },
          data: { aprState: 'Pending' },
        });
      return '';
    }
    if (kind === 'Amendment') {
      const m = await tx.ctAmendment.findUnique({ where: { id: entityId } });
      if (!m) return '';
      if (status === 'Approved')
        await tx.ctAmendment.update({
          where: { id: m.id },
          data: { status: 'Approved', aprState: 'Approved' },
        });
      if (back)
        await tx.ctAmendment.update({
          where: { id: m.id },
          data: { status: 'Draft', aprState: status },
        });
      return status === 'Approved'
        ? `${m.number} approved — send it for signature.`
        : '';
    }
    if (kind === 'Template') {
      const t = await tx.ctTemplate.findUnique({ where: { id: entityId } });
      if (!t) return '';
      if (status === 'Approved') {
        await tx.ctTemplateVersion.updateMany({
          where: { templateId: t.id, status: 'Published' },
          data: { status: 'Superseded' },
        });
        await tx.ctTemplateVersion.updateMany({
          where: { templateId: t.id, version: t.version },
          data: { status: 'Published' },
        });
        await tx.ctTemplate.update({
          where: { id: t.id },
          data: { status: 'Published' },
        });
        return `${t.number} v${t.version} published — now immutable.`;
      }
      return '';
    }
    const d = await tx.ctDocument.findUnique({
      where: { id: entityId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!d) return '';
    if (status === 'Approved') {
      await tx.ctDocument.update({
        where: { id: d.id },
        data: { status: 'Active' },
      });
      if (d.versions[0])
        await tx.ctDocVersion.update({
          where: { id: d.versions[0].id },
          data: { state: 'Approved', immutable: true },
        });
      return `${d.number} approved — v${d.versions[0]?.version ?? 1} is now locked.`;
    }
    if (back)
      await tx.ctDocument.update({
        where: { id: d.id },
        data: { status: 'Draft' },
      });
    return '';
  }

  /** Cancels any open approval on a record (e.g. the record was archived). */
  async cancelFor(a: CtActor, entityId: string, why: string, tx?: Tx) {
    const db = tx ?? this.db;
    const open = await db.ctApproval.findMany({
      where: { businessId: a.rootId, entityId, status: { in: OPEN } },
    });
    for (const x of open) {
      await db.ctApproval.update({
        where: { id: x.id },
        data: { status: 'Cancelled' },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Approval cancelled',
        'approval',
        x.id,
        `${x.number} · ${why}`,
        { tx },
      );
    }
  }
}
