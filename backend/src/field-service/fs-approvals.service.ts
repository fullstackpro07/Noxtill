import { Injectable } from '@nestjs/common';
import {
  FsActor,
  FsContextService,
  fsErr,
  notFound,
} from './fs-context.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FsPartsService } from './fs-parts.service';
import { FS_ERRORS } from './fs.constants';

const txt = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Manager decisions on held actions (overtime dispatch, cancellation, reopen, high-value part use,
 * overtime labor). Approving applies the held action as the approver; nothing changed before that.
 */
@Injectable()
export class FsApprovalsService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly wos: FsWorkOrdersService,
    private readonly parts: FsPartsService,
  ) {}

  async decide(a: FsActor, id: string, approve: boolean, reason?: string) {
    this.ctx.need(a, 'approve', 'Deciding approvals');
    const r = await this.ctx.db.fsApproval.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!r) throw notFound('Approval');
    if (r.status !== 'Pending')
      throw fsErr(FS_ERRORS.INVALID, `Already ${r.status.toLowerCase()}.`);
    if (!approve && !reason?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Give a reason for the rejection.');
    const p = (r.payload ?? {}) as Record<string, unknown>;
    let msg = `${r.kind} rejected.`;
    if (approve) {
      if (r.kind === 'Overtime dispatch')
        await this.wos.assign(a, String(p.woId), {
          tech: String(p.tech),
          day: Number(p.day),
          h: Number(p.h),
          viaApproval: true,
        });
      else if (r.kind === 'Work-order cancellation')
        await this.wos.cancel(a, String(p.woId), txt(p.reason), true);
      else if (r.kind === 'Reopen closed WO')
        await this.wos.reopen(a, String(p.woId), txt(p.reason), true);
      else if (r.kind === 'High-value part use')
        await this.parts.use(
          a,
          String(p.woId),
          String(p.partId),
          { qty: Number(p.qty), reason: txt(p.reason) },
          true,
        );
      else if (r.kind === 'Overtime labor')
        await this.ctx.db.fsLabor.updateMany({
          where: {
            id: String(p.laborId),
            businessId: a.rootId,
            status: 'Submitted',
          },
          data: { status: 'Approved', decidedById: a.userId },
        });
      msg = `${r.kind} approved and applied.`;
    }
    await this.ctx.db.fsApproval.update({
      where: { id: r.id },
      data: {
        status: approve ? 'Approved' : 'Rejected',
        decidedById: a.userId,
        decidedAt: new Date(),
        reason: reason?.slice(0, 255) || null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      approve ? 'Approval granted' : 'Approval rejected',
      r.subjectType,
      r.subjectId,
      `${r.kind} · ${r.what}${reason ? ` · ${reason}` : ''}`,
    );
    await this.ctx.notify(
      a.rootId,
      [r.requestedById],
      `${r.kind} ${approve ? 'approved' : 'rejected'}`,
      r.what,
      '/field-service',
      a.userId,
    );
    return { ok: true, msg };
  }
}
