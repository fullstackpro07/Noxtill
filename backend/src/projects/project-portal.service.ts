import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { EmailService } from '../messaging/channels/email.service';
import { InboxAutomationService } from '../unified-inbox/inbox-automation.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  isoDay,
  mergeConfig,
  todayIn,
} from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import {
  INVITE_DAYS,
  PORTAL_CODE_MINUTES,
  PORTAL_SESSION_HOURS,
  PROJECT_ERRORS,
} from './projects.constants';
import { progressOf, statusCategory, MTask } from './projects-metrics';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export interface Delivery {
  emailed: boolean;
  reason?: string;
  link?: string;
}

/**
 * The client portal. One function (`clientView`) builds everything a client may see, and both
 * the in-app "Client preview" and the public token-authenticated portal use it — so the preview
 * is exactly what the client sees. It never includes internal notes, costs, rates, budget, risk
 * scores, unshared tasks, or internal/private files.
 */
@Injectable()
export class ProjectPortalService {
  private readonly logger = new Logger(ProjectPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
    private readonly s3: S3Service,
    private readonly email: EmailService,
    private readonly inbox: InboxAutomationService,
    private readonly config: ConfigService,
  ) {}

  private link(token: string) {
    return `${(this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')}/portal/p/${token}`;
  }

  private emailReady() {
    return (
      !!this.config.get<string>('EMAIL_PROVIDER_KEY') &&
      !!this.config.get<string>('EMAIL_FROM_ADDRESS')
    );
  }

  private async sendEmail(
    businessId: string,
    to: string,
    subject: string,
    text: string,
    customerId?: string | null,
  ): Promise<boolean> {
    try {
      await this.email.send({
        to,
        text: `${subject}\n\n${text}`,
        templateKey: 'project_portal',
        locale: 'en',
        businessId,
        customerId: customerId ?? undefined,
      });
      return true;
    } catch (e) {
      this.logger.warn(`portal email failed: ${(e as Error).message}`);
      return false;
    }
  }

  // ── staff side ───────────────────────────────────────────────────────────

  async preview(actor: AuthenticatedUser, projectId: string) {
    const p = await this.loader.project(projectId);
    const L = await this.loader.load(actor);
    if (!L.projects.some((x) => x.id === projectId))
      throw new AppException(
        PROJECT_ERRORS.NOT_FOUND,
        'Project not found',
        HttpStatus.NOT_FOUND,
      );
    const cfg = await this.ctx.config();
    const view = await this.clientView(p.businessId, projectId);
    const access = await this.prisma.projectPortalAccess.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return {
      ...view,
      portalOn: cfg.portalOn,
      requireCode: cfg.portalMfa,
      inviteExp: cfg.inviteExp,
      emailReady: this.emailReady(),
      access: access.map((a) => ({
        id: a.id,
        email: a.email,
        clientName: a.clientName,
        expiresAt: a.expiresAt.toISOString(),
        active: !a.revokedAt && a.expiresAt > now,
        revoked: !!a.revokedAt,
        visits: a.visits,
        lastVisitAt: a.lastVisitAt?.toISOString() ?? null,
      })),
    };
  }

  private async issue(
    actor: AuthenticatedUser,
    projectId: string,
    email: string | null,
  ): Promise<{ token: string; clientName: string }> {
    const p = await this.loader.project(projectId);
    const cfg = await this.ctx.config();
    if (!cfg.portalOn)
      throw new AppException(
        PROJECT_ERRORS.PORTAL_DISABLED,
        'The client portal is switched off in Project Settings.',
        HttpStatus.CONFLICT,
      );
    if (!p.customerId)
      throw new AppException(
        PROJECT_ERRORS.PORTAL_NO_CUSTOMER,
        'Link this project to a customer before sharing the portal.',
        HttpStatus.BAD_REQUEST,
      );
    const c = await this.prisma.customer.findUniqueOrThrow({
      where: { id: p.customerId },
      select: { name: true },
    });
    const token = randomBytes(24).toString('base64url');
    const days = INVITE_DAYS[cfg.inviteExp] ?? 14;
    await this.ctx.db.projectPortalAccess.create({
      data: {
        businessId: this.ctx.businessId(),
        projectId,
        clientName: c.name,
        email: email || null,
        tokenHash: sha(token),
        expiresAt: new Date(Date.now() + days * 864e5),
        requireCode: cfg.portalMfa,
        invitedById: actor.sub,
      },
    });
    return { token, clientName: c.name };
  }

  /** Invite: a fresh expiring link, emailed when possible — otherwise returned to copy, and we say so. */
  async invite(
    actor: AuthenticatedUser,
    projectId: string,
    emailOverride?: string,
  ): Promise<Delivery> {
    await this.perms.assert(actor, 'Manage client portal');
    const p = await this.loader.project(projectId);
    const cust = p.customerId
      ? await this.prisma.customer.findUnique({
          where: { id: p.customerId },
          select: { email: true },
        })
      : null;
    const email = (emailOverride || cust?.email || '').trim() || null;
    const cfg = await this.ctx.config();
    if (cfg.portalMfa && !email)
      throw new AppException(
        PROJECT_ERRORS.PORTAL_CODE,
        'Sign-in codes are required and this client has no email address. Add one to the customer, or turn off the email-code requirement in Project Settings.',
        HttpStatus.BAD_REQUEST,
      );
    const { token, clientName } = await this.issue(actor, projectId, email);
    const link = this.link(token);
    await this.ctx.activity(
      actor,
      'portal.invited',
      `invited ${clientName} to the ${p.name} portal`,
      { projectId },
    );
    await this.ctx.auditLog(
      'project_portal.invited',
      'Project',
      projectId,
      undefined,
      { email, expires: cfg.inviteExp },
    );
    if (!email)
      return {
        emailed: false,
        reason:
          'This customer has no email address, so nothing was emailed. Copy the link and send it yourself.',
        link,
      };
    if (!this.emailReady())
      return {
        emailed: false,
        reason:
          'Email sending is not configured, so nothing was emailed. Copy the link and send it yourself.',
        link,
      };
    const biz = await this.ctx.business();
    const ok = await this.sendEmail(
      this.ctx.businessId(),
      email,
      `${biz.name}: your project portal for ${p.name}`,
      `Open your secure project portal: ${link}\nThis link expires in ${cfg.inviteExp}.${cfg.portalMfa ? ' You will be emailed a sign-in code each time.' : ''}`,
      p.customerId,
    );
    return ok
      ? { emailed: true, link }
      : {
          emailed: false,
          reason:
            'The email provider refused the message, so nothing was delivered. Copy the link instead.',
          link,
        };
  }

  /** Used by approvals: tell the client something needs them, with a fresh portal link. */
  async notifyClient(
    actor: AuthenticatedUser,
    projectId: string,
    subject: string,
    text: string,
  ): Promise<Delivery> {
    const p = await this.loader.project(projectId);
    const cfg = await this.ctx.config();
    if (!cfg.portalOn)
      return {
        emailed: false,
        reason:
          'The client portal is off, so the client cannot see or answer this request yet.',
      };
    const cust = p.customerId
      ? await this.prisma.customer.findUnique({
          where: { id: p.customerId },
          select: { email: true },
        })
      : null;
    if (!cust?.email)
      return {
        emailed: false,
        reason:
          'The customer has no email address — the request is waiting in their portal; share the portal link with them.',
      };
    if (!this.emailReady())
      return {
        emailed: false,
        reason:
          'Email sending is not configured — share the portal link with the client yourself.',
      };
    const { token } = await this.issue(actor, projectId, cust.email);
    const ok = await this.sendEmail(
      this.ctx.businessId(),
      cust.email,
      subject,
      `${text}\n\n${this.link(token)}`,
      p.customerId,
    );
    return ok
      ? { emailed: true }
      : { emailed: false, reason: 'The email provider refused the message.' };
  }

  async revoke(actor: AuthenticatedUser, accessId: string) {
    await this.perms.assert(actor, 'Manage client portal');
    const a = await this.ctx.db.projectPortalAccess.findFirst({
      where: { id: accessId },
    });
    if (!a)
      throw new AppException(
        PROJECT_ERRORS.NOT_FOUND,
        'Invite not found',
        HttpStatus.NOT_FOUND,
      );
    await this.ctx.db.projectPortalAccess.update({
      where: { id: accessId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.projectPortalSession.deleteMany({ where: { accessId } });
    await this.ctx.auditLog(
      'project_portal.revoked',
      'ProjectPortalAccess',
      accessId,
    );
    return { ok: true };
  }

  // ── client-safe view (shared by preview and the public portal) ───────────

  async clientView(businessId: string, projectId: string) {
    const p = await this.prisma.project.findFirstOrThrow({
      where: { id: projectId, businessId },
    });
    const [
      biz,
      settings,
      customer,
      tasks,
      milestones,
      files,
      approvals,
      updates,
    ] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, currency: true, timezone: true },
      }),
      this.prisma.projectSettings.findUnique({ where: { businessId } }),
      p.customerId
        ? this.prisma.customer.findUnique({
            where: { id: p.customerId },
            select: { id: true, name: true },
          })
        : null,
      this.prisma.projectTask.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.projectMilestone.findMany({
        where: { projectId },
        orderBy: { plannedDate: 'asc' },
      }),
      this.prisma.projectFile.findMany({
        where: { projectId, access: 'client_shared', archivedAt: null },
        include: { versions: { orderBy: { n: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectApproval.findMany({
        where: {
          projectId,
          approverKind: 'client',
          status: { notIn: ['Draft', 'Cancelled'] },
        },
        include: { events: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectComment.findMany({
        where: { projectId, taskId: null, portalAuthor: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const cfg = mergeConfig(settings?.config);
    const today = todayIn(biz.timezone);
    const statusCat = statusCategory(cfg.statuses, p.status);
    const mt = tasks.map((t) => ({ status: t.status }) as MTask);
    const progress = progressOf(mt, statusCat);
    // Internal states are softened for the client: At Risk/Blocked read as "In progress".
    const clientStatus =
      statusCat === 'Done'
        ? 'Completed'
        : statusCat === 'Not started'
          ? 'Planned'
          : statusCat === 'Paused' && p.status === 'On Hold'
            ? 'On Hold'
            : 'In progress';
    const msClient = milestones.map((m) => {
      const planned = isoDay(m.plannedDate)!;
      const s =
        m.status === 'Completed'
          ? 'Completed'
          : m.status === 'Ready for Approval'
            ? 'Ready for Approval'
            : m.status === 'Cancelled'
              ? 'Cancelled'
              : planned < today || m.status === 'In Progress'
                ? 'In Progress'
                : 'Planned';
      return {
        id: m.id,
        name: m.name,
        status: s,
        date: planned,
        actual: isoDay(m.actualDate),
      };
    });
    const nextM =
      msClient
        .filter((m) => m.status !== 'Completed' && m.status !== 'Cancelled')
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    const openAppr = approvals.filter(
      (a) => a.status === 'Sent' || a.status === 'Viewed',
    );
    const canInvoices = !!cfg.perms['View financials']?.Client;
    let invoices: Array<{
      no: string;
      amount: number;
      status: string;
      paid: boolean;
    }> | null = null;
    if (canInvoices && customer) {
      const orders = await this.prisma.order.findMany({
        where: {
          businessId,
          customerId: customer.id,
          isQuotation: false,
          status: { not: 'cancelled' },
          ...(p.startDate ? { createdAt: { gte: p.startDate } } : {}),
        },
        select: {
          orderNo: true,
          total: true,
          createdAt: true,
          payments: { select: { amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      invoices = orders.map((o) => {
        const paidAmt = o.payments.reduce((a, x) => a + Number(x.amount), 0);
        const paid = paidAmt >= Number(o.total) - 0.005;
        return {
          no: `#${o.orderNo}`,
          amount: Number(o.total),
          status: paid ? 'Paid' : paidAmt > 0 ? 'Part paid' : 'Due',
          paid,
        };
      });
    }
    const outstanding =
      invoices?.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0) ??
      null;
    const tl = [
      ...msClient
        .filter((m) => m.status === 'Completed')
        .map((m) => ({
          t: `Milestone completed: ${m.name}`,
          when: m.actual ?? m.date,
        })),
      ...files.slice(0, 3).map((f) => ({
        t: `New file shared: ${f.name}`,
        when: (f.versions[0]?.createdAt ?? f.updatedAt)
          .toISOString()
          .slice(0, 10),
      })),
      ...approvals.slice(0, 3).map((a) => ({
        t: `Approval ${a.status.toLowerCase()}: ${a.item}`,
        when: a.lastActivityAt.toISOString().slice(0, 10),
      })),
    ].sort((a, b) => b.when.localeCompare(a.when));
    return {
      business: biz.name,
      currency: biz.currency,
      project: {
        id: p.id,
        name: p.name,
        client: customer?.name ?? 'Client',
        progress,
        status: clientStatus,
        dueDate: isoDay(p.dueDate),
      },
      cards: {
        progress,
        status: clientStatus,
        nextMilestone: nextM,
        waiting: openAppr.length,
        sharedFiles: files.length,
        target: isoDay(p.dueDate),
        outstanding,
        invoicesShared: canInvoices,
      },
      updates: tl.slice(0, 6),
      tasks: tasks
        .filter((t) => t.clientVisible && t.status !== 'Cancelled')
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status === 'Blocked' ? 'In Progress' : t.status,
          due: isoDay(t.dueDate),
        })),
      milestones: msClient.filter((m) => m.status !== 'Cancelled'),
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        ext: f.ext,
        version: f.versions[0]?.n ?? 1,
        size: f.versions[0]?.sizeBytes ?? 0,
      })),
      approvals: approvals.map((a) => ({
        id: a.id,
        item: a.item,
        type: a.type,
        status: a.status,
        message: a.message ?? '',
        due: isoDay(a.dueDate),
        open: a.status === 'Sent' || a.status === 'Viewed',
        last: a.lastActivityAt.toISOString(),
      })),
      invoices,
      messages: updates.map((c) => ({
        id: c.id,
        who: c.authorName,
        body: c.body,
        when: c.createdAt.toISOString(),
      })),
    };
  }

  // ── public (token) side ──────────────────────────────────────────────────

  private async accessByToken(token: string) {
    const a = await this.prisma.projectPortalAccess.findUnique({
      where: { tokenHash: sha(token || '') },
    });
    if (!a || a.revokedAt || a.expiresAt < new Date())
      throw new AppException(
        PROJECT_ERRORS.PORTAL_INVALID,
        'This portal link is invalid or has expired. Ask your project team for a new one.',
        HttpStatus.UNAUTHORIZED,
      );
    const settings = await this.prisma.projectSettings.findUnique({
      where: { businessId: a.businessId },
    });
    if (!mergeConfig(settings?.config).portalOn)
      throw new AppException(
        PROJECT_ERRORS.PORTAL_DISABLED,
        'This portal is currently switched off.',
        HttpStatus.FORBIDDEN,
      );
    return a;
  }

  async redeem(token: string) {
    const a = await this.accessByToken(token);
    if (a.requireCode) {
      if (!a.email)
        throw new AppException(
          PROJECT_ERRORS.PORTAL_CODE,
          'This portal needs an email code but no email is on file. Ask your project team to resend the invite.',
          HttpStatus.CONFLICT,
        );
      if (!this.emailReady())
        throw new AppException(
          PROJECT_ERRORS.PORTAL_CODE,
          'Sign-in codes can’t be emailed right now. Ask your project team for help.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.prisma.projectPortalAccess.update({
        where: { id: a.id },
        data: {
          codeHash: sha(a.id + code),
          codeExpiresAt: new Date(Date.now() + PORTAL_CODE_MINUTES * 60000),
        },
      });
      const biz = await this.prisma.business.findUnique({
        where: { id: a.businessId },
        select: { name: true },
      });
      const ok = await this.sendEmail(
        a.businessId,
        a.email,
        `${biz?.name ?? 'Your project team'}: portal sign-in code`,
        `Your sign-in code is ${code}. It expires in ${PORTAL_CODE_MINUTES} minutes.`,
      );
      if (!ok)
        throw new AppException(
          PROJECT_ERRORS.PORTAL_CODE,
          'We could not email your sign-in code. Try again shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      return { needsCode: true, sentTo: maskEmail(a.email) };
    }
    return {
      needsCode: false,
      session: await this.openSession(a.id, a.businessId),
    };
  }

  async verify(token: string, code: string) {
    const a = await this.accessByToken(token);
    if (
      !a.codeHash ||
      !a.codeExpiresAt ||
      a.codeExpiresAt < new Date() ||
      a.codeHash !== sha(a.id + (code || '').trim())
    ) {
      throw new AppException(
        PROJECT_ERRORS.PORTAL_CODE,
        'That code is wrong or has expired.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.prisma.projectPortalAccess.update({
      where: { id: a.id },
      data: { codeHash: null, codeExpiresAt: null },
    });
    return { session: await this.openSession(a.id, a.businessId) };
  }

  private async openSession(accessId: string, businessId: string) {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.projectPortalSession.create({
      data: {
        businessId,
        accessId,
        sessionHash: sha(raw),
        expiresAt: new Date(Date.now() + PORTAL_SESSION_HOURS * 3.6e6),
      },
    });
    await this.prisma.projectPortalAccess.update({
      where: { id: accessId },
      data: { lastVisitAt: new Date(), visits: { increment: 1 } },
    });
    return raw;
  }

  async bySession(session: string | undefined) {
    const s = session
      ? await this.prisma.projectPortalSession.findUnique({
          where: { sessionHash: sha(session) },
          include: { access: true },
        })
      : null;
    if (
      !s ||
      s.expiresAt < new Date() ||
      s.access.revokedAt ||
      s.access.expiresAt < new Date()
    ) {
      throw new AppException(
        PROJECT_ERRORS.PORTAL_INVALID,
        'Your portal session has ended. Open your invite link again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return s.access;
  }

  async publicView(session: string | undefined) {
    const a = await this.bySession(session);
    const view = await this.clientView(a.businessId, a.projectId);
    // Opening the portal counts as the client viewing any newly sent approval.
    const sent = await this.prisma.projectApproval.findMany({
      where: { projectId: a.projectId, approverKind: 'client', status: 'Sent' },
      select: { id: true },
    });
    for (const x of sent) {
      await this.prisma.projectApproval.update({
        where: { id: x.id },
        data: { status: 'Viewed', lastActivityAt: new Date() },
      });
      await this.prisma.projectApprovalEvent.create({
        data: {
          businessId: a.businessId,
          approvalId: x.id,
          actorName: a.clientName,
          what: 'viewed the request',
        },
      });
    }
    if (sent.length) return this.clientView(a.businessId, a.projectId);
    return view;
  }

  async publicDecide(
    session: string | undefined,
    approvalId: string,
    decision: string,
    comment?: string,
  ) {
    const a = await this.bySession(session);
    const ap = await this.prisma.projectApproval.findFirst({
      where: { id: approvalId, projectId: a.projectId, approverKind: 'client' },
    });
    if (!ap)
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_NOT_FOUND,
        'Approval not found',
        HttpStatus.NOT_FOUND,
      );
    if (!['Sent', 'Viewed'].includes(ap.status))
      throw new AppException(
        PROJECT_ERRORS.APPROVAL_STATE,
        `This request is already ${ap.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    if (!['Approved', 'Changes Requested', 'Rejected'].includes(decision))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Unknown decision.',
        HttpStatus.BAD_REQUEST,
      );
    if (decision !== 'Approved' && !comment?.trim())
      throw new AppException(
        PROJECT_ERRORS.COMMENT_REQUIRED,
        'Please add a comment first.',
        HttpStatus.BAD_REQUEST,
      );
    await this.prisma.projectApproval.update({
      where: { id: ap.id },
      data: { status: decision, lastActivityAt: new Date() },
    });
    await this.prisma.projectApprovalEvent.create({
      data: {
        businessId: a.businessId,
        approvalId: ap.id,
        actorName: a.clientName,
        what: `${decision.toLowerCase()} in the client portal`,
        note: comment?.trim() || null,
      },
    });
    await this.ctx.activity(
      { name: a.clientName },
      decision === 'Approved' ? 'approval.approved' : 'approval.rejected',
      `${decision.toLowerCase()} ${ap.item}`,
      { projectId: a.projectId },
      a.businessId,
    );
    const requester = ap.requestedById
      ? await this.prisma.businessUser.findFirst({
          where: { userId: ap.requestedById, businessId: a.businessId },
          select: { id: true },
        })
      : null;
    await this.ctx.notifyPerson(
      requester?.id,
      'Client comment added',
      {
        title: `${a.clientName} ${decision.toLowerCase()} ${ap.item}`,
        body: comment?.trim() || 'Decision recorded in the client portal.',
        link: '/projects/approvals',
      },
      undefined,
      a.businessId,
    );
    return { ok: true };
  }

  async publicDownload(session: string | undefined, fileId: string) {
    const a = await this.bySession(session);
    const f = await this.prisma.projectFile.findFirst({
      where: {
        id: fileId,
        projectId: a.projectId,
        access: 'client_shared',
        archivedAt: null,
      },
      include: { versions: { orderBy: { n: 'desc' }, take: 1 } },
    });
    if (!f || !f.versions[0])
      throw new AppException(
        PROJECT_ERRORS.FILE_NOT_FOUND,
        'File not found',
        HttpStatus.NOT_FOUND,
      );
    return {
      url: await this.s3.getSignedDownloadUrl(f.versions[0].storageKey, 3600),
      name: f.name,
    };
  }

  /**
   * A client message: kept on the project, and — when the client has an email — delivered into
   * Unified Inbox as an email conversation so the team answers it there (replies go to the client).
   */
  async publicMessage(session: string | undefined, body: string) {
    const a = await this.bySession(session);
    const text = (body ?? '').trim();
    if (!text)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Write a message first.',
        HttpStatus.BAD_REQUEST,
      );
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id: a.projectId },
      select: { name: true, customerId: true, managerId: true },
    });
    await this.prisma.projectComment.create({
      data: {
        businessId: a.businessId,
        projectId: a.projectId,
        authorName: a.clientName,
        portalAuthor: true,
        body: text.slice(0, 5000),
      },
    });
    await this.ctx.activity(
      { name: a.clientName },
      'comment.created',
      `commented on ${p.name}`,
      { projectId: a.projectId },
      a.businessId,
    );
    let inInbox = false;
    if (a.email) {
      try {
        await this.inbox.ingest({
          businessId: a.businessId,
          channel: 'email',
          contactHandle: a.email,
          contactName: a.clientName,
          customerId: p.customerId,
          text: `[${p.name} portal] ${text}`,
        });
        inInbox = true;
      } catch (e) {
        this.logger.warn(
          `portal message inbox ingest failed: ${(e as Error).message}`,
        );
      }
    }
    await this.ctx.notifyPerson(
      p.managerId,
      'Client comment added',
      {
        title: `${a.clientName} sent a message`,
        body: text.slice(0, 140),
        link: `/projects/${a.projectId}`,
      },
      undefined,
      a.businessId,
    );
    return { ok: true, inInbox };
  }
}

function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}
