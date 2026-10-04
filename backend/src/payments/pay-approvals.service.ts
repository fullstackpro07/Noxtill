import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, Tx, dec } from './pay-context.service';
import { PAY_ERRORS } from './payments.constants';

/**
 * Payments approvals. They are stored here and surfaced in the central Action Center (type
 * payment_approval) — Payments has no approval engine of its own beyond recording the decision.
 */
@Injectable()
export class PayApprovalsService {
  constructor(private readonly ctx: PayContextService) {}

  async request(
    rootId: string,
    a: PayActor | 'System',
    p: {
      kind: 'refund' | 'dispute' | 'policy';
      subjectId: string;
      title: string;
      amount?: number | null;
      rule: string;
      payload?: Record<string, unknown>;
    },
    tx?: Tx,
  ) {
    const db = tx ?? this.ctx.db;
    await db.payApproval.updateMany({
      where: {
        businessId: rootId,
        kind: p.kind,
        subjectId: p.subjectId,
        status: 'Pending',
      },
      data: { status: 'Cancelled' },
    });
    const row = await db.payApproval.create({
      data: {
        businessId: rootId,
        kind: p.kind,
        subjectId: p.subjectId,
        title: p.title.slice(0, 200),
        amount: p.amount == null ? null : dec(p.amount),
        rule: p.rule.slice(0, 200),
        requestedById: a === 'System' ? 'System' : a.userId,
        status: 'Pending',
        payload: (p.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.ctx.notifyOwners(
      rootId,
      'Payment approval needed',
      p.title,
      `/payments/refunds?approval=${row.id}`,
      a === 'System' ? undefined : a.userId,
    );
    return row;
  }

  async pending(rootId: string, kind: string, subjectId: string) {
    return this.ctx.db.payApproval.findFirst({
      where: { businessId: rootId, kind, subjectId, status: 'Pending' },
    });
  }

  async decide(a: PayActor, id: string, approve: boolean, comment?: string) {
    this.ctx.need(a, 'approve', 'Deciding a payment approval');
    const ap = await this.ctx.db.payApproval.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!ap)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    if (ap.status !== 'Pending')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Already ${ap.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    if (ap.requestedById === a.userId && a.role !== 'Owner')
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'You requested this — another approver must decide it.',
        HttpStatus.FORBIDDEN,
      );
    const row = await this.ctx.db.payApproval.update({
      where: { id },
      data: {
        status: approve ? 'Approved' : 'Rejected',
        decidedById: a.userId,
        decidedAt: new Date(),
        comment: comment?.slice(0, 500) ?? null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      approve ? 'Approval granted' : 'Approval rejected',
      ap.kind,
      ap.subjectId,
      `${ap.title}${comment ? ` · ${comment}` : ''}`,
    );
    return row;
  }

  async list(rootId: string) {
    return this.ctx.db.payApproval.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
