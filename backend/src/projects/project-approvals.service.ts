import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  isoDay,
  parseDay,
} from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { ProjectPortalService } from './project-portal.service';
import {
  APPROVAL_OPEN,
  APPROVAL_TYPES,
  PROJECT_ERRORS,
} from './projects.constants';

export interface ApprovalInput {
  projectId: string;
  type: string;
  item: string;
  message?: string;
  evidenceFileId?: string | null;
  milestoneId?: string | null;
  /** 'client' or a BusinessUser id for an internal approver. */
  approver: string;
  dueDate?: string | null;
  draft?: boolean;
}

@Injectable()
export class ProjectApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
    private readonly portal: ProjectPortalService,
  ) {}

  async list(actor: AuthenticatedUser) {
    const L = await this.loader.load(actor);
    const visible = new Set(L.projects.map((p) => p.id));
    const rows = await this.prisma.projectApproval.findMany({
      where: { businessId: this.ctx.businessId() },
      include: { events: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    const files = await this.prisma.projectFile.findMany({
      where: { businessId: this.ctx.businessId() },
      select: { id: true, name: true },
    });
    const fileName = new Map(files.map((f) => [f.id, f.name]));
    return rows
      .filter((a) => visible.has(a.projectId))
      .map((a) => ({
        id: a.id,
        number: a.number,
        projectId: a.projectId,
        type: a.type,
        item: a.item,
        message: a.message,
        evidence: a.evidenceFileId
          ? (fileName.get(a.evidenceFileId) ?? 'File removed')
          : 'None attached',
        evidenceFileId: a.evidenceFileId,
        milestoneId: a.milestoneId,
        kind: a.approverKind,
        approverUserId: a.approverUserId,
        from: `${a.approverName} (${a.approverKind})`,
        requestedAt: a.requestedAt?.toISOString() ?? null,
        dueDate: isoDay(a.dueDate),
        status: a.status,
        lastActivityAt: a.lastActivityAt.toISOString(),
        isMine: !!L.acc.personId && a.approverUserId === L.acc.personId,
        audit: a.events.map((e) => ({
          who: e.actorName,
          what: e.what,
          note: e.note,
          t: e.createdAt.toISOString(),
        })),
      }));
  }

  private async approval(id: string) {
    const a = await this.prisma.projectApproval.findUnique({ where: { id } });
    if (!a)
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    await this.loader.project(a.projectId);
    return a;
  }

  private async event(
    approvalId: string,
    actorName: string,
    what: string,
    note?: string | null,
  ) {
    await this.prisma.projectApproval.update({
      where: { id: approvalId },
      data: { lastActivityAt: new Date() },
    });
    await this.prisma.projectApprovalEvent.create({
      data: {
        businessId: this.ctx.businessId(),
        approvalId,
        actorName,
        what,
        note: note || null,
      },
    });
  }

  async create(actor: AuthenticatedUser, input: ApprovalInput) {
    await this.perms.assert(actor, 'Request approvals');
    const p = await this.loader.project(input.projectId);
    const item = (input.item ?? '').trim();
    if (!item)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Name the item that needs approval.',
        HttpStatus.BAD_REQUEST,
      );
    const type = APPROVAL_TYPES.includes(input.type) ? input.type : 'Other';
    let kind: 'client' | 'internal';
    let approverUserId: string | null = null;
    let approverName: string;
    if (input.approver === 'client') {
      if (!p.customerId)
        throw new AppException(
          PROJECT_ERRORS.PORTAL_NO_CUSTOMER,
          'This project has no customer, so there is no client to ask.',
          HttpStatus.BAD_REQUEST,
        );
      const c = await this.prisma.customer.findUnique({
        where: { id: p.customerId },
        select: { name: true },
      });
      kind = 'client';
      approverName = c?.name ?? 'Client';
    } else {
      const person = (await this.ctx.people()).find(
        (x) => x.id === input.approver && x.active,
      );
      if (!person)
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Pick an approver.',
          HttpStatus.BAD_REQUEST,
        );
      kind = 'internal';
      approverUserId = person.id;
      approverName = person.name;
    }
    if (input.evidenceFileId) {
      const f = await this.prisma.projectFile.findFirst({
        where: { id: input.evidenceFileId, projectId: p.id },
      });
      if (!f)
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Evidence must be a file on this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    if (input.milestoneId) {
      const m = await this.prisma.projectMilestone.findFirst({
        where: { id: input.milestoneId, projectId: p.id },
      });
      if (!m)
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Milestone must be on this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    const number = await this.ctx.nextNumber('apprSeq');
    const who = await this.ctx.actorName(actor);
    const a = await this.ctx.db.projectApproval.create({
      data: {
        businessId: this.ctx.businessId(),
        number,
        projectId: p.id,
        type,
        item: item.slice(0, 255),
        message: input.message?.trim() || null,
        evidenceFileId: input.evidenceFileId || null,
        milestoneId: input.milestoneId || null,
        approverKind: kind,
        approverUserId,
        approverName,
        requestedById: actor.sub,
        requestedAt: input.draft ? null : new Date(),
        dueDate: parseDay(input.dueDate ?? null),
        status: input.draft ? 'Draft' : 'Sent',
      },
    });
    await this.event(
      a.id,
      who,
      input.draft ? 'saved a draft' : 'sent the request',
    );
    let delivery: { emailed: boolean; reason?: string } | null = null;
    if (!input.draft) delivery = await this.deliver(actor, a.id);
    return { id: a.id, number, delivery };
  }

  /** Tells the approver: in-app notification for staff, a fresh portal sign-in link by email for a client. */
  private async deliver(
    actor: AuthenticatedUser,
    id: string,
    reminder = false,
  ) {
    const a = await this.approval(id);
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id: a.projectId },
      select: { name: true },
    });
    const who = await this.ctx.actorName(actor);
    if (a.approverKind === 'internal') {
      await this.ctx.notifyPerson(
        a.approverUserId,
        'Approval requested',
        {
          title: `${reminder ? 'Reminder: ' : ''}approval needed — ${a.item}`,
          body: `${who} asked you to review ${a.item} on ${p.name}.`,
          link: '/projects/approvals',
        },
        actor.sub,
      );
      return { emailed: false, reason: 'Sent as an in-app notification.' };
    }
    return this.portal.notifyClient(
      actor,
      a.projectId,
      `${reminder ? 'Reminder: ' : ''}${a.item} needs your approval`,
      `${who} asked you to review “${a.item}” for ${p.name}. Open your project portal to approve, request changes or reject.`,
    );
  }

  async send(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Request approvals');
    const a = await this.approval(id);
    if (a.status !== 'Draft')
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        'Only a draft can be sent.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.db.projectApproval.update({
      where: { id },
      data: { status: 'Sent', requestedAt: new Date() },
    });
    await this.event(id, await this.ctx.actorName(actor), 'sent the request');
    await this.ctx.activity(
      actor,
      'approval.requested',
      `requested approval: ${a.item}`,
      { projectId: a.projectId },
    );
    return { delivery: await this.deliver(actor, id) };
  }

  /** Internal approver decision. A client approval can never be decided by staff. */
  async decide(
    actor: AuthenticatedUser,
    id: string,
    decision: string,
    comment?: string,
  ) {
    const a = await this.approval(id);
    if (a.approverKind === 'client')
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_CLIENT_ONLY,
        'Only the client can approve this, from their portal. Staff can’t record a decision for them.',
        HttpStatus.FORBIDDEN,
      );
    if (!APPROVAL_OPEN.includes(a.status))
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        `This request is ${a.status.toLowerCase()} and can’t be decided.`,
        HttpStatus.CONFLICT,
      );
    if (!['Approved', 'Changes Requested', 'Rejected'].includes(decision))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Unknown decision.',
        HttpStatus.BAD_REQUEST,
      );
    const acc = await this.perms.access(actor);
    if (acc.role !== 'Owner' && acc.personId !== a.approverUserId)
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_NOT_APPROVER,
        `Only ${a.approverName} can decide this request.`,
        HttpStatus.FORBIDDEN,
      );
    if (decision !== 'Approved' && !comment?.trim())
      throw new AppException(
        PROJECT_ERRORS.COMMENT_REQUIRED,
        'Add a comment first.',
        HttpStatus.BAD_REQUEST,
      );
    await this.ctx.db.projectApproval.update({
      where: { id },
      data: { status: decision },
    });
    await this.event(
      id,
      await this.ctx.actorName(actor),
      decision.toLowerCase(),
      comment?.trim(),
    );
    await this.ctx.activity(
      actor,
      decision === 'Approved' ? 'approval.approved' : 'approval.rejected',
      `${decision.toLowerCase()} ${a.item}`,
      { projectId: a.projectId },
    );
    await this.ctx.auditLog(
      'project_approval.decided',
      'ProjectApproval',
      id,
      { status: a.status },
      { status: decision, comment },
    );
    if (a.requestedById) {
      const bu = await this.prisma.businessUser.findFirst({
        where: { userId: a.requestedById, businessId: this.ctx.businessId() },
        select: { id: true },
      });
      await this.ctx.notifyPerson(
        bu?.id,
        'Approval requested',
        {
          title: `${a.item}: ${decision}`,
          body:
            comment?.trim() ||
            `${a.approverName} ${decision.toLowerCase()} the request.`,
          link: '/projects/approvals',
        },
        actor.sub,
      );
    }
    return { ok: true };
  }

  async remind(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Request approvals');
    const a = await this.approval(id);
    if (!APPROVAL_OPEN.includes(a.status))
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        'Only an open request can be reminded.',
        HttpStatus.CONFLICT,
      );
    const delivery = await this.deliver(actor, id, true);
    await this.event(
      id,
      await this.ctx.actorName(actor),
      delivery.emailed
        ? 'sent a reminder by email'
        : a.approverKind === 'internal'
          ? 'sent an in-app reminder'
          : 'tried to send a reminder (not delivered)',
      delivery.emailed ? null : delivery.reason,
    );
    return { delivery };
  }

  async resubmit(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Request approvals');
    const a = await this.approval(id);
    if (a.status !== 'Changes Requested')
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        'Only a request with changes requested can be resubmitted.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.db.projectApproval.update({
      where: { id },
      data: { status: 'Sent', requestedAt: new Date() },
    });
    await this.event(
      id,
      await this.ctx.actorName(actor),
      'resubmitted with changes',
    );
    await this.ctx.activity(
      actor,
      'approval.requested',
      `resubmitted ${a.item}`,
      { projectId: a.projectId },
    );
    return { delivery: await this.deliver(actor, id) };
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Request approvals');
    const a = await this.approval(id);
    if (!['Draft', 'Sent', 'Viewed', 'Changes Requested'].includes(a.status))
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        'This request can no longer be cancelled.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.db.projectApproval.update({
      where: { id },
      data: { status: 'Cancelled' },
    });
    await this.event(
      id,
      await this.ctx.actorName(actor),
      'cancelled the request',
    );
    return { ok: true };
  }
}
