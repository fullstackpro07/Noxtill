import { HttpStatus, Injectable } from '@nestjs/common';
import { HelpdeskTicket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskOpsService, SYSTEM } from './helpdesk-ops.service';
import { Attachment, HelpdeskTicketsService } from './helpdesk-tickets.service';
import { HD_ERRORS, isOpenStatus } from './helpdesk.constants';
import {
  ArticleVoteDto,
  HelpRequestDto,
  PortalRateDto,
  PortalRequestDto,
} from './dto/helpdesk.dto';

const invalid = () =>
  new AppException(
    HD_ERRORS.PORTAL_INVALID,
    'This support link is invalid or no longer available.',
    HttpStatus.NOT_FOUND,
  );
const bad = (m: string) =>
  new AppException(HD_ERRORS.INVALID, m, HttpStatus.BAD_REQUEST);

/**
 * What customers see: their ticket (public replies and status only — internal notes, events and
 * agent data are never included), the survey, and the published help articles. Authorised by the
 * unguessable portal token (ticket) or the business slug (public help center).
 */
@Injectable()
export class HelpdeskPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly ops: HelpdeskOpsService,
    private readonly tickets: HelpdeskTicketsService,
    private readonly s3: S3Service,
  ) {}

  private async byToken(token: string): Promise<HelpdeskTicket> {
    if (!token || token.length < 20) throw invalid();
    let t = await this.prisma.helpdeskTicket.findUnique({
      where: { portalToken: token },
    });
    if (!t) throw invalid();
    // A merged ticket's link keeps working: it shows the ticket it was merged into.
    for (let i = 0; t.mergedIntoId && i < 10; i++)
      t =
        (await this.prisma.helpdeskTicket.findUnique({
          where: { id: t.mergedIntoId },
        })) ?? t;
    return t;
  }

  private async business(id: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id },
      select: { name: true, slug: true, branding: true },
    });
  }

  private articleCard(a: {
    id: string;
    title: string;
    slug: string;
    category: string;
    summary: string | null;
  }) {
    return {
      title: a.title,
      slug: a.slug,
      category: a.category,
      summary: a.summary ?? '',
    };
  }

  async view(token: string) {
    const t = await this.byToken(token);
    const cfg = await this.ctx.config(t.businessId);
    const [biz, msgs, csat, arts, customer] = await Promise.all([
      this.business(t.businessId),
      this.prisma.helpdeskMessage.findMany({
        where: {
          ticketId: t.id,
          kind: { in: ['cust', 'reply'] },
          OR: [{ delivery: null }, { delivery: { not: 'failed' } }],
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.helpdeskCsat.findUnique({ where: { ticketId: t.id } }),
      this.prisma.helpdeskArticle.findMany({
        where: {
          businessId: t.businessId,
          status: 'Published',
          visibility: { in: ['Customer Portal', 'Public'] },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.customer.findUnique({
        where: { id: t.customerId },
        select: { name: true },
      }),
    ]);
    const canRate =
      !isOpenStatus(t.status) &&
      csat != null &&
      (csat.status === 'sent' || csat.status === 'scheduled');
    return {
      business: { name: biz.name },
      customer: customer?.name?.split(' ')[0] ?? '',
      ticket: {
        number: t.number,
        subject: t.subject,
        status: t.status,
        open: isOpenStatus(t.status),
        closed: t.status === 'Closed',
        createdAt: t.createdAt.toISOString(),
      },
      messages: msgs.map((m) => ({
        id: m.id,
        mine: m.kind === 'cust',
        by: m.kind === 'cust' ? 'You' : m.authorName,
        body: m.body,
        at: m.createdAt.toISOString(),
        attachments: ((m.attachments as unknown as Attachment[]) ?? []).map(
          (a, i) => ({ i, name: a.name, type: a.type, size: a.size }),
        ),
      })),
      survey: {
        canRate,
        rated:
          csat?.status === 'responded'
            ? { rating: csat.rawRating, comment: csat.comment }
            : null,
        scale: csat?.scale ?? cfg.csat.scale,
        comment: cfg.csat.comment,
      },
      categories: cfg.categories,
      articles: arts.map((a) => this.articleCard(a)),
    };
  }

  async reply(token: string, text: string) {
    const t = await this.byToken(token);
    const cfg = await this.ctx.config(t.businessId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
      select: { name: true },
    });
    const name = customer?.name ?? 'Customer';
    let cur = t;
    if (!isOpenStatus(t.status)) {
      const win = this.ops.reopenWindowDays(cfg);
      const at = t.resolvedAt ?? t.closedAt ?? t.updatedAt;
      const inWindow =
        t.status === 'Resolved' &&
        win != null &&
        Date.now() - at.getTime() <= win * 86400000;
      if (!inWindow) {
        const n = await this.tickets.create(null, t.businessId, {
          customerId: t.customerId,
          subject: `Follow-up: ${t.subject}`.slice(0, 300),
          description: text,
          channel: 'Portal',
          category: t.category,
          priority: t.priority,
          branchId: t.branchId,
          origin: `Ticket created from the customer portal · follow-up to ${t.number}`,
        });
        return { ok: true, newToken: n.portalToken, number: n.number };
      }
      cur = await this.ops.reopen(
        t,
        SYSTEM,
        `${name} replied in the customer portal`,
      );
    }
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: t.businessId,
        ticketId: cur.id,
        kind: 'cust',
        authorName: name.slice(0, 191),
        body: text.trim(),
      },
    });
    await this.prisma.helpdeskTicket.update({
      where: { id: cur.id },
      data: { lastActivityAt: new Date(), lastKind: 'cust' },
    });
    if (cur.status === 'Waiting on Customer')
      await this.ops.setStatus(cur, 'Open', SYSTEM, cfg);
    await this.ctx.notify(
      t.businessId,
      [cur.agentUserId, ...((cur.followers as string[]) ?? [])],
      'Customer reply',
      {
        title: `${name} replied on ${cur.number}`,
        body: text.slice(0, 200),
        link: `/helpdesk/tickets/${cur.number}`,
      },
      { cfg },
    );
    return { ok: true };
  }

  async rate(token: string, dto: PortalRateDto) {
    const t = await this.byToken(token);
    const cfg = await this.ctx.config(t.businessId);
    const c = await this.prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    if (
      !c ||
      !['sent', 'scheduled'].includes(c.status) ||
      isOpenStatus(t.status)
    )
      throw new AppException(
        HD_ERRORS.CONFLICT,
        'This request isn’t waiting for a rating.',
        HttpStatus.CONFLICT,
      );
    const scale = c.scale;
    const raw = dto.rating;
    if (scale === '1–10' ? raw > 10 : raw > 5)
      throw bad('Rating out of range.');
    const rating =
      scale === '1–10'
        ? Math.ceil(raw / 2)
        : scale === 'Good / Bad'
          ? raw >= 3
            ? 5
            : 1
          : raw;
    const comment = cfg.csat.comment ? dto.comment?.trim() || null : null;
    const threshold = cfg.csat.followUp.startsWith('Rating ≤ 2')
      ? 2
      : cfg.csat.followUp.startsWith('Rating ≤ 3')
        ? 3
        : 0;
    const followUp = rating <= threshold ? 'Open' : null;
    await this.prisma.helpdeskCsat.update({
      where: { id: c.id },
      data: {
        status: 'responded',
        rating,
        rawRating: raw,
        comment,
        respondedAt: new Date(),
        sentAt: c.sentAt ?? new Date(),
        followUp,
      },
    });
    await this.ops.sys(
      t,
      SYSTEM,
      `Customer rated ${raw}${scale === '1–10' ? '/10' : scale === 'Good / Bad' ? (raw >= 3 ? ' (Good)' : ' (Bad)') : '/5'}${comment ? ' · with a comment' : ''}`,
    );
    if (followUp) {
      await this.prisma.helpdeskMessage.create({
        data: {
          businessId: t.businessId,
          ticketId: t.id,
          kind: 'note',
          authorName: 'System',
          body: `Automatic CSAT follow-up: rated ${rating}/5${comment ? ` — “${comment}”` : ''}. Contact the customer to understand the poor rating.`,
        },
      });
      const managers = (await this.ctx.agents(t.businessId))
        .filter((a) => a.role !== 'Agent')
        .map((a) => a.id);
      await this.ctx.notify(
        t.businessId,
        [t.agentUserId, ...managers],
        'Negative CSAT',
        {
          title: `Poor rating on ${t.number}`,
          body: `${rating}/5${comment ? ` — ${comment}` : ''}`,
          link: `/helpdesk/tickets/${t.number}`,
        },
        { cfg },
      );
    }
    return { ok: true };
  }

  async request(token: string, dto: PortalRequestDto) {
    const t = await this.byToken(token);
    const cfg = await this.ctx.config(t.businessId);
    const n = await this.tickets.create(null, t.businessId, {
      customerId: t.customerId,
      subject: dto.subject,
      description: dto.description,
      channel: 'Portal',
      category:
        dto.category && cfg.categories.includes(dto.category)
          ? dto.category
          : cfg.categories[0],
      priority: cfg.general.defaultPriority,
      origin: 'Ticket created from the customer portal',
    });
    return { token: n.portalToken, number: n.number };
  }

  async attachment(token: string, messageId: string, index: number) {
    const t = await this.byToken(token);
    const m = await this.prisma.helpdeskMessage.findFirst({
      where: { id: messageId, ticketId: t.id, kind: { in: ['cust', 'reply'] } },
    });
    const a = ((m?.attachments as unknown as Attachment[]) ?? [])[index];
    if (!a) throw invalid();
    return {
      url: await this.s3.getSignedDownloadUrl(a.key, 300),
      name: a.name,
    };
  }

  // ── articles (portal + public help center) ───────────────────────────────

  private async article(
    rootId: string,
    slug: string,
    visibilities: string[],
    source: string,
  ) {
    const a = await this.prisma.helpdeskArticle.findUnique({
      where: { businessId_slug: { businessId: rootId, slug } },
    });
    if (!a || a.status !== 'Published' || !visibilities.includes(a.visibility))
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Article not found.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.helpdeskArticleEvent.create({
      data: { businessId: rootId, articleId: a.id, kind: 'view', source },
    });
    const related = await this.prisma.helpdeskArticle.findMany({
      where: {
        businessId: rootId,
        id: { in: (a.related as string[]) ?? [] },
        status: 'Published',
        visibility: { in: visibilities },
      },
    });
    return {
      title: a.title,
      slug: a.slug,
      category: a.category,
      summary: a.summary ?? '',
      body: a.body,
      updatedAt: a.updatedAt.toISOString(),
      related: related.map((r) => this.articleCard(r)),
    };
  }

  private async vote(
    rootId: string,
    slug: string,
    visibilities: string[],
    source: string,
    dto: ArticleVoteDto,
  ) {
    const a = await this.prisma.helpdeskArticle.findUnique({
      where: { businessId_slug: { businessId: rootId, slug } },
    });
    if (!a || a.status !== 'Published' || !visibilities.includes(a.visibility))
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Article not found.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.helpdeskArticleEvent.create({
      data: {
        businessId: rootId,
        articleId: a.id,
        kind: dto.helpful ? 'helpful' : 'unhelpful',
        source,
        comment: dto.comment?.trim() || null,
      },
    });
    return { ok: true };
  }

  async portalArticle(token: string, slug: string) {
    const t = await this.byToken(token);
    return this.article(
      t.businessId,
      slug,
      ['Customer Portal', 'Public'],
      'portal',
    );
  }

  async portalVote(token: string, slug: string, dto: ArticleVoteDto) {
    const t = await this.byToken(token);
    return this.vote(
      t.businessId,
      slug,
      ['Customer Portal', 'Public'],
      'portal',
      dto,
    );
  }

  private async rootBySlug(slug: string) {
    const b = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, parentId: true },
    });
    if (!b)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Help center not found.',
        HttpStatus.NOT_FOUND,
      );
    return b.parentId ?? b.id;
  }

  async helpCenter(slug: string) {
    const rootId = await this.rootBySlug(slug);
    const [biz, cfg, arts] = await Promise.all([
      this.business(rootId),
      this.ctx.config(rootId),
      this.prisma.helpdeskArticle.findMany({
        where: {
          businessId: rootId,
          status: 'Published',
          visibility: 'Public',
        },
        orderBy: { title: 'asc' },
      }),
    ]);
    return {
      business: { name: biz.name, slug: biz.slug },
      categories: cfg.categories,
      articles: arts.map((a) => this.articleCard(a)),
    };
  }

  async helpArticle(slug: string, articleSlug: string) {
    return this.article(
      await this.rootBySlug(slug),
      articleSlug,
      ['Public'],
      'public',
    );
  }

  async helpVote(slug: string, articleSlug: string, dto: ArticleVoteDto) {
    return this.vote(
      await this.rootBySlug(slug),
      articleSlug,
      ['Public'],
      'public',
      dto,
    );
  }

  /**
   * The help center "Submit a request" form (the Web channel). Links the request to the matching
   * CRM customer by phone or email, or adds them to Customers (CRM) — Helpdesk never keeps its own
   * customer copy.
   */
  async helpRequest(slug: string, dto: HelpRequestDto) {
    if (dto.website) return { token: null, number: null }; // honeypot: silently drop bots
    const rootId = await this.rootBySlug(slug);
    const cfg = await this.ctx.config(rootId);
    const email = dto.email?.trim().toLowerCase() || null;
    const digits = (dto.phone ?? '').replace(/\D/g, '');
    const phone = digits ? `+${digits}` : null;
    if (!phone && !email)
      throw bad('Enter your phone number or email so we can reply.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw bad('Enter a valid email address.');
    const groupIds = (await this.ctx.branches(rootId)).map((b) => b.id);
    let customer = await this.prisma.customer.findFirst({
      where: {
        businessId: { in: groupIds },
        OR: [
          ...(phone ? [{ phone }, { phone: digits }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!customer) {
      if (!phone)
        throw bad(
          'We couldn’t find you by email — add your phone number so we can create your request.',
        );
      customer = await this.prisma.customer.create({
        data: {
          businessId: rootId,
          name: dto.name.trim().slice(0, 191),
          phone,
          email,
        },
      });
    }
    const t = await this.tickets.create(null, rootId, {
      customerId: customer.id,
      subject: dto.subject,
      description: dto.description,
      channel: 'Web',
      category:
        dto.category && cfg.categories.includes(dto.category)
          ? dto.category
          : cfg.categories[0],
      priority: cfg.general.defaultPriority,
      origin: `Ticket created from the help center request form by ${dto.name.trim()}`,
    });
    return { token: t.portalToken, number: t.number };
  }
}
