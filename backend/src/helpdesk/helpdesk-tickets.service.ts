import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HelpdeskTicket, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import {
  InboxHooksService,
  InboxHookEvent,
} from '../unified-inbox/inbox-hooks.service';
import {
  HdActor,
  HelpdeskContextService,
  tokenOf,
} from './helpdesk-context.service';
import { HelpdeskLoaderService, Loaded, TRow } from './helpdesk-loader.service';
import {
  HelpdeskOpsService,
  SYSTEM,
  Who,
  normalizeTag,
} from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import {
  CHANNELS,
  ESCALATION_REASONS,
  FILE_OK,
  HD_ERRORS,
  HOME_BRANCH,
  HelpdeskConfig,
  LINK_TYPES,
  MAX_FILE_BYTES,
  PAGE_SIZE,
  PRIORITIES,
  PRIORITY_ORDER,
  channelFromInbox,
  isOpenStatus,
} from './helpdesk.constants';
import {
  BulkDto,
  CreateTicketDto,
  EscalateDto,
  FromConversationDto,
  LinkDto,
  MergeDto,
  ReplyDto,
  SplitDto,
  TicketFieldDto,
  TicketListQuery,
} from './dto/helpdesk.dto';
import { fmtM } from './helpdesk-sla.util';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

export interface Attachment {
  key: string;
  name: string;
  type: string;
  size: number;
}

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/x-cfb',
  'application/zip',
];

const bad = (m: string) =>
  new AppException(HD_ERRORS.INVALID, m, HttpStatus.BAD_REQUEST);
const forbidden = (m: string) =>
  new AppException(HD_ERRORS.FORBIDDEN, m, HttpStatus.FORBIDDEN);
const conflict = (m: string) =>
  new AppException(HD_ERRORS.CONFLICT, m, HttpStatus.CONFLICT);

export function fillVars(
  txt: string,
  v: { customer: string; ticket: string; agent: string },
): string {
  return txt
    .replace(
      /\{\{\s*customer_name\s*\}\}/g,
      v.customer.split(' ')[0] ?? v.customer,
    )
    .replace(/\{\{\s*ticket_number\s*\}\}/g, v.ticket)
    .replace(/\{\{\s*agent_name\s*\}\}/g, v.agent);
}

@Injectable()
export class HelpdeskTicketsService implements OnModuleInit {
  private readonly logger = new Logger(HelpdeskTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly loader: HelpdeskLoaderService,
    private readonly ops: HelpdeskOpsService,
    private readonly delivery: HelpdeskDeliveryService,
    private readonly s3: S3Service,
    private readonly hooks: InboxHooksService,
  ) {}

  onModuleInit() {
    this.hooks.onInbound((e) => this.onInbound(e));
    this.hooks.onOutbound((e) => this.onOutbound(e));
  }

  // ── list / export ────────────────────────────────────────────────────────

  filter(rows: TRow[], f: TicketListQuery): TRow[] {
    const q = (f.q ?? '').trim().toLowerCase().replace(/^#/, '');
    const now = Date.now();
    return rows.filter((t) => {
      if (q) {
        const hay = [
          t.number,
          t.subject,
          t.customerName,
          t.customerEmail,
          t.customerPhone,
          ...t.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.st === '__active' ? !t.open : f.st && t.status !== f.st)
        return false;
      if (f.pri && t.priority !== f.pri) return false;
      if (f.ch && t.channel !== f.ch) return false;
      if (f.cat && t.category !== f.cat) return false;
      if (
        f.agent &&
        (f.agent === '__none' ? t.agentUserId : t.agentUserId !== f.agent)
      )
        return false;
      if (f.queue && t.queueId !== f.queue) return false;
      if (f.br && t.branchId !== f.br) return false;
      if (f.cust && t.customerId !== f.cust) return false;
      if (f.tag && !t.tags.includes(f.tag)) return false;
      if (f.sla) {
        const k = t.sla.k;
        if (
          f.sla === 'Healthy'
            ? !['Healthy', 'Paused', 'Met'].includes(k)
            : f.sla === 'Breached'
              ? !['Breached', 'Missed'].includes(k)
              : k !== f.sla
        )
          return false;
      }
      if (f.date) {
        const h = { '24h': 24, '7d': 168, '30d': 720 }[f.date] ?? 0;
        if (now - new Date(t.createdAt).getTime() > h * 3600000) return false;
      }
      return true;
    });
  }

  sort(rows: TRow[], s = 'updated'): TRow[] {
    const due = (t: TRow) =>
      t.sla.dueAt ? new Date(t.sla.dueAt).getTime() : Infinity;
    const fn: Record<string, (a: TRow, b: TRow) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      priority: (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        b.updatedAt.localeCompare(a.updatedAt),
      sla: (a, b) => due(a) - due(b),
      customer: (a, b) => a.customerName.localeCompare(b.customerName),
    };
    return [...rows].sort(fn[s] ?? fn.updated);
  }

  async list(actor: HdActor, f: TicketListQuery) {
    const L = await this.loader.load(actor, { branch: f.branch });
    const filtered = this.sort(this.filter(L.rows, f), f.sort);
    const size = f.limit ?? PAGE_SIZE;
    const pages = Math.max(1, Math.ceil(filtered.length / size));
    const page = Math.min(f.page ?? 0, pages - 1);
    const custs = new Map<string, string>();
    for (const t of L.rows) custs.set(t.customerId, t.customerName);
    return {
      rows: filtered.slice(page * size, page * size + size),
      total: filtered.length,
      base: L.rows.length,
      page,
      pages,
      pageSize: size,
      /** Every ticket number matching the filters (bulk "select page" works on the current page only). */
      tags: [...new Set(L.rows.flatMap((t) => t.tags))].sort(),
      customers: [...custs]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async exportCsv(
    actor: HdActor,
    f: TicketListQuery,
  ): Promise<{ csv: string; count: number }> {
    const L = await this.loader.load(actor, { branch: f.branch });
    const rows = this.sort(this.filter(L.rows, f), f.sort);
    const head = [
      'Ticket',
      'Subject',
      'Customer ID',
      'Channel',
      'Category',
      'Priority',
      'Status',
      'Agent',
      'SLA',
      'Created',
    ];
    const lines = [
      head,
      ...rows.map((t) => [
        t.number,
        t.subject,
        t.customerId,
        t.channel,
        t.category,
        t.priority,
        t.status,
        t.agentName,
        t.sla.k,
        t.createdAt,
      ]),
    ];
    const esc = (v: string | number | null | undefined) =>
      '"' + String(v ?? '').replace(/"/g, '""') + '"';
    await this.ctx.log(
      actor.rootId,
      actor,
      'Tickets exported',
      `${rows.length} rows (CSV)`,
    );
    return {
      csv: '﻿' + lines.map((r) => r.map(esc).join(',')).join('\n'),
      count: rows.length,
    };
  }

  async customers(actor: HdActor, q = '') {
    const groupIds = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    const s = q.trim();
    const rows = await this.prisma.customer.findMany({
      where: {
        businessId: { in: groupIds },
        ...(s
          ? {
              OR: [
                { name: { contains: s } },
                { phone: { contains: s } },
                { email: { contains: s } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: s ? { name: 'asc' } : { updatedAt: 'desc' },
      take: 40,
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      sub: c.email || c.phone,
    }));
  }

  // ── detail ───────────────────────────────────────────────────────────────

  async visibleTicket(
    actor: HdActor,
    number: string,
  ): Promise<{ t: HelpdeskTicket; L: Loaded; row: TRow }> {
    const t = await this.ops.ticketByNumber(actor.rootId, number);
    const L = await this.loader.load(actor, { where: { id: t.id } });
    const row = L.all[0];
    if (!L.rows.length)
      throw forbidden(
        `Ticket ${t.number} belongs to a queue or agent outside your permissions. IDs in the URL are always re-checked.`,
      );
    return { t, L, row };
  }

  async detail(actor: HdActor, number: string) {
    const { t, L, row } = await this.visibleTicket(actor, number);
    const cfg = L.cfg;
    const [messages, links, audit, customer, route, csat] = await Promise.all([
      this.prisma.helpdeskMessage.findMany({
        where: { ticketId: t.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.helpdeskLink.findMany({
        where: { ticketId: t.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.helpdeskAudit.findMany({
        where: { ticketId: t.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.customerCard(actor, cfg, t),
      this.delivery.route(t),
      this.prisma.helpdeskCsat.findUnique({ where: { ticketId: t.id } }),
    ]);
    const statuses = await this.delivery.statuses(
      messages
        .map((m) => m.inboxMessageId)
        .filter((x): x is string => !!x && true),
    );
    const merged = (t.mergedFrom as Array<{ number: string }>) ?? [];
    return {
      ticket: {
        ...row,
        description: t.description,
        mergedFrom: merged.map((m) => m.number),
        portalUrl: this.delivery.portalUrl(t.portalToken),
        conversationLabel: t.conversationId
          ? await this.conversationLabel(t.conversationId)
          : null,
      },
      route,
      csat: csat
        ? {
            status: csat.status,
            rating: csat.rating,
            sendAt: csat.sendAt.toISOString(),
            failReason: csat.failReason,
          }
        : null,
      messages: messages.map((m) => {
        const st = m.inboxMessageId
          ? statuses.get(m.inboxMessageId)
          : undefined;
        let meta: string | null = null;
        let failed = false;
        if (m.kind === 'reply') {
          if (m.delivery === 'failed') {
            meta = m.deliveryNote ?? '✕ Not delivered';
            failed = true;
          } else if (m.delivery === 'portal')
            meta = '✓ Posted to the customer portal';
          else if (st) {
            const label =
              {
                queued: 'Queued',
                sent: 'Sent',
                delivered: 'Delivered',
                read: 'Read',
                failed: 'Failed',
              }[st.status] ?? st.status;
            failed = st.status === 'failed';
            meta = `${failed ? '✕' : '✓'} ${label} via ${m.via ?? 'Unified Inbox'}${failed && st.error ? ' — ' + st.error : ''} · also in customer portal`;
          } else if (m.via) meta = `✓ Sent via ${m.via}`;
        }
        return {
          id: m.id,
          kind: m.kind,
          by: m.authorName,
          body: m.body,
          at: m.createdAt.toISOString(),
          from: m.fromLabel,
          meta,
          failed,
          attachments: ((m.attachments as unknown as Attachment[]) ?? []).map(
            (a, i) => ({ i, name: a.name, type: a.type, size: a.size }),
          ),
        };
      }),
      links: links.map((l) => ({
        id: l.id,
        type: l.type,
        label: l.label,
        refId: l.refId,
      })),
      audit: audit.map((a) => ({
        what: a.action,
        by: a.actorName,
        at: a.createdAt.toISOString(),
        detail: a.detail,
      })),
      customer,
      followers: row.followers,
      reopenAllowed:
        !t.mergedIntoId &&
        (this.ops.reopenWindowDays(cfg) != null || actor.ri <= 1),
    };
  }

  private async conversationLabel(id: string) {
    const c = await this.prisma.inboxConversation.findUnique({
      where: { id },
      select: { channel: true, contactHandle: true },
    });
    return c ? `${this.delivery.label(c.channel)} · ${c.contactHandle}` : null;
  }

  private async customerCard(
    actor: HdActor,
    cfg: HelpdeskConfig,
    t: HelpdeskTicket,
  ) {
    const c = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
    });
    if (!c) return null;
    const biz = await this.prisma.business.findUnique({
      where: { id: c.businessId },
      select: { currency: true },
    });
    const money = (n: number) =>
      `${biz?.currency ?? ''} ${Math.round(n).toLocaleString('en-US')}`.trim();
    const [orders, bookings, other, segment, credit] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: c.id, isQuotation: false },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { orderNo: true, createdAt: true, total: true, status: true },
      }),
      this.prisma.appointment.findMany({
        where: { customerId: c.id },
        orderBy: { startsAt: 'desc' },
        take: 3,
        include: { service: { select: { name: true } } },
      }),
      this.prisma.helpdeskTicket.findMany({
        where: {
          businessId: t.businessId,
          customerId: c.id,
          id: { not: t.id },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.ctx.segmentLabel(c.id),
      this.ctx.can(actor, cfg, 'View customer credit')
        ? this.prisma.creditEntry.groupBy({
            by: ['kind'],
            where: { customerId: c.id },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
    ]);
    let creditText = 'Hidden — requires “View customer credit”';
    if (credit) {
      const sum = (k: string) =>
        Number(credit.find((x) => x.kind === k)?._sum.amount ?? 0);
      const bal = sum('credit') - sum('payment') - sum('write_off');
      const limit = c.creditLimit == null ? null : Number(c.creditLimit);
      creditText =
        credit.length === 0
          ? 'No credit account'
          : `${money(bal)} owed${limit != null ? ` · limit ${money(limit)}` : ''}`;
    }
    const d = (x: Date) =>
      x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const L = await this.loader.load(actor, {
      where: { id: { in: other.map((o) => o.id) } },
    });
    const visible = new Set(L.rows.map((r) => r.id));
    const prev = other.filter((o) => visible.has(o.id));
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      since: c.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      }),
      segment,
      openTickets:
        prev.filter((o) => isOpenStatus(o.status)).length +
        (isOpenStatus(t.status) ? 1 : 0),
      previousTickets: prev.filter((o) => !isOpenStatus(o.status)).length,
      credit: creditText,
      prev: prev.slice(0, 4).map((o) => ({
        number: o.number,
        subject: o.subject,
        status: o.status,
      })),
      orders: orders.map((o) => ({
        a: `ORD-${o.orderNo}`,
        b: `${d(o.createdAt)} · ${o.status.replace('_', ' ')}`,
        c: money(Number(o.total)),
      })),
      bookings: bookings.map((b) => ({
        a: b.bookingNo != null ? `BK-${b.bookingNo}` : 'Booking',
        b: `${b.startsAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${b.service.name}`,
        c: b.status.replace('_', ' '),
      })),
    };
  }

  async attachmentUrl(
    actor: HdActor,
    number: string,
    messageId: string,
    index: number,
  ) {
    const { t } = await this.visibleTicket(actor, number);
    const m = await this.prisma.helpdeskMessage.findFirst({
      where: { id: messageId, ticketId: t.id },
    });
    const a = ((m?.attachments as unknown as Attachment[]) ?? [])[index];
    if (!a)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Attachment not found.',
        HttpStatus.NOT_FOUND,
      );
    return {
      url: await this.s3.getSignedDownloadUrl(a.key, 300),
      name: a.name,
    };
  }

  // ── create ───────────────────────────────────────────────────────────────

  async storeFiles(
    rootId: string,
    files: UploadedFile[] = [],
  ): Promise<Attachment[]> {
    const out: Attachment[] = [];
    for (const f of files) {
      const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
      if (!FILE_OK.includes(ext) || f.size > MAX_FILE_BYTES)
        throw bad(
          `Blocked attachment: ${f.originalname} — type not allowed or over 10 MB.`,
        );
      await validateUploadedFile(f, {
        allowedMimeTypes: ALLOWED_MIME,
        maxSizeBytes: MAX_FILE_BYTES,
      });
      const key = `helpdesk/${rootId}/${randomUUID()}.${ext}`;
      await this.s3.upload(key, f.buffer, f.mimetype);
      out.push({
        key,
        name: f.originalname.replace(/[\\/]/g, '_').slice(0, 200),
        type: ext.toUpperCase(),
        size: f.size,
      });
    }
    return out;
  }

  /** Routing when no queue is chosen: a category-matched queue in the ticket's branch, else the default. */
  private async routeQueue(
    rootId: string,
    cfg: HelpdeskConfig,
    category: string,
    branchId: string,
  ) {
    const queues = await this.prisma.helpdeskQueue.findMany({
      where: { businessId: rootId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const byCat = queues.find(
      (q) =>
        !q.systemKey &&
        ((q.categories as string[]) ?? []).includes(category) &&
        (!q.branchId || q.branchId === branchId),
    );
    if (byCat) return byCat;
    return (
      queues.find((q) => q.name === cfg.general.defaultQueue) ??
      queues.find((q) => q.systemKey === 'unassigned') ??
      null
    );
  }

  async create(
    actor: HdActor | null,
    rootId: string,
    dto: CreateTicketDto & {
      firstMessages?: Array<{
        kind: string;
        by: string;
        body: string;
        at?: Date;
        attachments?: Attachment[];
        inboxMessageId?: string | null;
        from?: string;
      }>;
      origin?: string;
    },
    files: UploadedFile[] = [],
  ): Promise<HelpdeskTicket> {
    const cfg = await this.ctx.config(rootId);
    const who: Who = actor ?? SYSTEM;
    const branches = await this.ctx.branches(rootId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer || !branches.some((b) => b.id === customer.businessId))
      throw bad('Select a customer from Customers (CRM).');
    if (!(CHANNELS as readonly string[]).includes(dto.channel))
      throw bad('Unknown channel.');
    if (!cfg.categories.includes(dto.category))
      throw bad(`“${dto.category}” isn’t a category in Settings.`);
    if (!(PRIORITIES as readonly string[]).includes(dto.priority))
      throw bad('Unknown priority.');
    let branchId =
      dto.branchId && branches.some((b) => b.id === dto.branchId)
        ? dto.branchId
        : null;
    if (!branchId) {
      const named = branches.find((b) => b.name === cfg.general.defaultBranch);
      branchId =
        cfg.general.defaultBranch === HOME_BRANCH || !named
          ? customer.businessId
          : named.id;
    }
    let queueId: string | null = null;
    if (dto.queueId) {
      const q = await this.prisma.helpdeskQueue.findFirst({
        where: { id: dto.queueId, businessId: rootId, active: true },
      });
      if (!q) throw bad('That queue is disabled or doesn’t exist.');
      queueId = q.id;
    } else
      queueId =
        (await this.routeQueue(rootId, cfg, dto.category, branchId))?.id ??
        null;
    if (dto.agentId) {
      if (actor) this.ctx.assert(actor, cfg, 'Assign', 'Assigning');
      await this.ctx.assertAgent(rootId, dto.agentId);
    }
    const atts = await this.storeFiles(rootId, files);
    const tags = (dto.tags ?? '').split(',').map(normalizeTag).filter(Boolean);
    const creator = actor ? `${actor.name}` : 'System';

    const t = await this.prisma.$transaction(async (tx) => {
      const { number, seq } = await this.ctx.nextNumber(rootId, tx);
      const created = await tx.helpdeskTicket.create({
        data: {
          businessId: rootId,
          number,
          seq,
          subject: dto.subject.trim(),
          description: dto.description?.trim() || null,
          customerId: customer.id,
          branchId: branchId,
          channel: dto.channel,
          conversationId: dto.conversationId ?? null,
          category: dto.category,
          subcategory: dto.subcategory?.trim() || null,
          priority: dto.priority,
          status: 'New',
          queueId,
          tags: [...new Set(tags)],
          portalToken: tokenOf(24),
          createdByUserId: actor?.userId ?? null,
          lastKind: 'cust',
        },
      });
      const first = dto.firstMessages ?? [
        {
          kind: 'cust',
          by: customer.name,
          body: dto.description?.trim() || '(no description)',
          attachments: atts,
        },
      ];
      const base = Date.now();
      await tx.helpdeskMessage.create({
        data: {
          businessId: rootId,
          ticketId: created.id,
          kind: 'sys',
          authorUserId: actor?.userId ?? null,
          authorName: creator,
          body:
            dto.origin ??
            `Ticket created by ${creator} · channel ${dto.channel}`,
          createdAt: new Date(base),
        },
      });
      let i = 1;
      for (const m of first)
        await tx.helpdeskMessage.create({
          data: {
            businessId: rootId,
            ticketId: created.id,
            kind: m.kind,
            authorName: m.by.slice(0, 191),
            body: m.body,
            attachments: (m.attachments ??
              []) as unknown as Prisma.InputJsonValue,
            inboxMessageId: m.inboxMessageId ?? null,
            fromLabel: m.from ?? null,
            createdAt: m.at ?? new Date(base + i++),
          },
        });
      return created;
    });

    const { sla } = await this.ops.slaOf(t, cfg);
    await this.ops.sys(t, SYSTEM, this.ops.describe(sla));
    await this.ctx.log(
      rootId,
      who,
      'Ticket created',
      `${t.number} · ${t.subject}`,
      t.id,
    );
    let cur = t;
    if (dto.agentId) cur = await this.ops.assign(cur, dto.agentId, who, cfg);
    else cur = await this.ops.autoAssign(cur, cfg);
    const q = cur.queueId
      ? await this.prisma.helpdeskQueue.findUnique({
          where: { id: cur.queueId },
        })
      : null;
    const agents = await this.ctx.agents(rootId);
    const recipients = cur.agentUserId
      ? []
      : ((q?.members as string[]) ?? []).length
        ? ((q?.members as string[]) ?? [])
        : agents.filter((a) => a.role !== 'Agent').map((a) => a.id);
    await this.ctx.notify(
      rootId,
      recipients,
      'New ticket',
      {
        title: `New ticket ${cur.number}`,
        body: `${cur.subject} — ${customer.name} · ${cur.channel}`,
        link: `/helpdesk/tickets/${cur.number}`,
      },
      { except: actor?.userId, cfg },
    );
    if (cfg.comms.ack) {
      const text =
        fillVars(cfg.comms.ackText, {
          customer: customer.name,
          ticket: cur.number,
          agent: 'Support',
        }) +
        `\n\nFollow your request: ${this.delivery.portalUrl(cur.portalToken)}`;
      const r = await this.delivery.notice(cur, text);
      await this.prisma.helpdeskTicket.update({
        where: { id: cur.id },
        data: { ackSentAt: r.delivery === 'failed' ? null : new Date() },
      });
      await this.ops.sys(
        cur,
        SYSTEM,
        r.delivery === 'failed'
          ? `Acknowledgement not sent — ${r.note.replace(/^✕ Not delivered — |^✕ Delivery failed — /, '')}`
          : `Acknowledgement sent via ${r.via}`,
      );
    }
    return this.ops.fresh(cur.id);
  }

  async createFromConversation(actor: HdActor, dto: FromConversationDto) {
    const conv = await this.prisma.inboxConversation.findUnique({
      where: { id: dto.conversationId },
    });
    const groupIds = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    if (!conv || !groupIds.includes(conv.businessId))
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Conversation not found.',
        HttpStatus.NOT_FOUND,
      );
    if (!conv.customerId)
      throw bad(
        'Link this conversation to a customer in Unified Inbox first — tickets always belong to a CRM customer.',
      );
    const open = await this.prisma.helpdeskTicket.findFirst({
      where: {
        conversationId: conv.id,
        mergedIntoId: null,
        status: { notIn: ['Resolved', 'Closed'] },
      },
    });
    if (open)
      throw conflict(
        `This conversation already has an open ticket: ${open.number}.`,
      );
    const mirrored = new Set(
      (
        await this.prisma.helpdeskMessage.findMany({
          where: { inboxMessageId: { not: null }, businessId: actor.rootId },
          select: { inboxMessageId: true },
        })
      ).map((m) => m.inboxMessageId),
    );
    const recent = (
      await this.prisma.inboxMessage.findMany({
        where: { conversationId: conv.id, kind: { in: ['in', 'out'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    )
      .reverse()
      .filter((m) => !mirrored.has(m.id));
    const cfg = await this.ctx.config(actor.rootId);
    const lastIn = [...recent].reverse().find((m) => m.kind === 'in');
    const priority =
      dto.priority && ['Urgent', 'High', 'Normal', 'Low'].includes(dto.priority)
        ? dto.priority
        : cfg.general.defaultPriority;
    const subject = (
      dto.subject?.trim() ||
      lastIn?.body.split(/\r?\n/)[0].slice(0, 120) ||
      `Conversation with ${conv.contactName}`
    ).slice(0, 300);
    return this.create(actor, actor.rootId, {
      conversationId: conv.id,
      subject,
      priority,
      customerId: conv.customerId,
      channel: channelFromInbox(conv.channel),
      branchId: conv.businessId,
      category:
        dto.category && cfg.categories.includes(dto.category)
          ? dto.category
          : cfg.categories[0],
      description: lastIn?.body ?? '',
      origin: `Ticket created from ${this.delivery.label(conv.channel)} via Unified Inbox by ${actor.name}`,
      firstMessages: recent.map((m) => ({
        kind: m.kind === 'in' ? 'cust' : 'reply',
        by: m.kind === 'in' ? conv.contactName : (m.authorName ?? 'Team'),
        body: m.body,
        at: m.createdAt,
        inboxMessageId: m.id,
      })),
    });
  }

  // ── field changes ────────────────────────────────────────────────────────

  async setField(actor: HdActor, number: string, dto: TicketFieldDto) {
    const { t, L } = await this.visibleTicket(actor, number);
    const cfg = L.cfg;
    const v = (dto.value ?? '').trim();
    if (dto.field === 'status') return this.changeStatus(actor, cfg, t, v);
    if (t.status === 'Closed')
      throw conflict('Ticket is closed — reopen it to change it.');
    if (dto.field === 'priority') {
      this.ctx.assert(actor, cfg, 'Change priority', 'Changing priority');
      return this.ops.setPriority(t, v, actor);
    }
    if (dto.field === 'agent') {
      this.ctx.assert(
        actor,
        cfg,
        t.agentUserId ? 'Reassign' : 'Assign',
        t.agentUserId ? 'Reassigning' : 'Assigning',
      );
      return this.ops.assign(t, v || null, actor, cfg);
    }
    if (dto.field === 'queue') {
      this.ctx.assert(actor, cfg, 'Reassign', 'Moving queues');
      return this.ops.setQueue(t, v, actor);
    }
    if (dto.field === 'category') {
      if (!cfg.categories.includes(v))
        throw bad(`“${v}” isn’t a category in Settings.`);
      return this.simpleField(actor, t, 'category', 'Category', v);
    }
    if (dto.field === 'subcategory')
      return this.simpleField(
        actor,
        t,
        'subcategory',
        'Subcategory',
        v || null,
      );
    if (dto.field === 'branch') {
      if (actor.ri > 1)
        throw forbidden('Agents can’t move tickets between branches.');
      const branches = await this.ctx.branches(actor.rootId);
      const b = branches.find((x) => x.id === v);
      if (!b) throw bad('Unknown branch.');
      if (b.id === t.branchId) return t;
      const old = branches.find((x) => x.id === t.branchId)?.name ?? '—';
      const n = await this.prisma.helpdeskTicket.update({
        where: { id: t.id },
        data: { branchId: b.id, lastActivityAt: new Date() },
      });
      await this.ops.sys(n, actor, `Branch ${old} → ${b.name}`);
      await this.ctx.log(
        actor.rootId,
        actor,
        'Branch changed',
        `${t.number} · ${old} → ${b.name}`,
        t.id,
      );
      return n;
    }
    throw bad('Unknown field.');
  }

  private async simpleField(
    actor: HdActor,
    t: HelpdeskTicket,
    key: 'category' | 'subcategory',
    label: string,
    v: string | null,
  ) {
    if ((t[key] ?? null) === v) return t;
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { [key]: v, lastActivityAt: new Date() },
    });
    await this.ops.sys(n, actor, `${label} ${t[key] || '—'} → ${v || '—'}`);
    await this.ctx.log(
      actor.rootId,
      actor,
      `${label} changed`,
      `${t.number} · ${v || '—'}`,
      t.id,
    );
    return n;
  }

  async changeStatus(
    actor: HdActor,
    cfg: HelpdeskConfig,
    t: HelpdeskTicket,
    ns: string,
    note?: string,
  ) {
    if (ns === 'Resolved') this.ctx.assert(actor, cfg, 'Resolve', 'Resolving');
    if (ns === 'Closed') this.ctx.assert(actor, cfg, 'Close', 'Closing');
    let cur = t;
    if (!isOpenStatus(t.status) && isOpenStatus(ns)) {
      this.assertReopen(actor, cfg, t);
      cur = await this.ops.reopen(t, actor);
      if (ns === 'Open') return cur;
    }
    if (note) {
      await this.prisma.helpdeskMessage.create({
        data: {
          businessId: t.businessId,
          ticketId: t.id,
          kind: 'note',
          authorUserId: actor.userId,
          authorName: actor.name,
          body: ns === 'Resolved' ? `Resolution: ${note}` : note,
        },
      });
    }
    return this.ops.setStatus(cur, ns, actor, cfg);
  }

  private assertReopen(actor: HdActor, cfg: HelpdeskConfig, t: HelpdeskTicket) {
    if (t.mergedIntoId) throw conflict('Merged tickets can’t be reopened.');
    if (this.ops.reopenWindowDays(cfg) == null && actor.ri > 1)
      throw forbidden(`Reopen policy: ${cfg.general.reopen}. Ask a Manager.`);
  }

  async reopen(actor: HdActor, number: string) {
    const { t, L } = await this.visibleTicket(actor, number);
    this.assertReopen(actor, L.cfg, t);
    return this.ops.reopen(t, actor);
  }

  async tag(actor: HdActor, number: string, tag: string, add: boolean) {
    const { t } = await this.visibleTicket(actor, number);
    if (t.status === 'Closed') throw conflict('Ticket is closed.');
    return this.ops.addTag(t, tag, actor, add);
  }

  async setFollowers(actor: HdActor, number: string, userIds: string[]) {
    const { t, L } = await this.visibleTicket(actor, number);
    const ids = [...new Set(userIds)];
    for (const id of ids)
      if (!L.agents.some((a) => a.id === id))
        throw bad('Followers must be Helpdesk agents.');
    const before = (t.followers as string[]) ?? [];
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { followers: ids, lastActivityAt: new Date() },
    });
    const name = (id: string) =>
      L.agents.find((a) => a.id === id)?.name ?? 'someone';
    const added = ids.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !ids.includes(x));
    if (added.length || removed.length)
      await this.ops.sys(
        n,
        actor,
        [
          added.length ? `Follower added: ${added.map(name).join(', ')}` : '',
          removed.length
            ? `Follower removed: ${removed.map(name).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    return n;
  }

  async escalate(actor: HdActor, number: string, dto: EscalateDto) {
    const { t, L } = await this.visibleTicket(actor, number);
    const cfg = L.cfg;
    if (!isOpenStatus(t.status))
      throw conflict('Only open tickets can be escalated.');
    if (!ESCALATION_REASONS.includes(dto.reason))
      throw bad('Choose an escalation reason.');
    const data: Prisma.HelpdeskTicketUpdateInput = {
      escalated: true,
      lastActivityAt: new Date(),
    };
    let toLabel: string;
    let notifyIds: string[];
    if (dto.to === 'escalations') {
      const q = L.queues.find((x) => x.systemKey === 'escalations');
      if (!q || !q.active) throw conflict('The Escalations queue is disabled.');
      data.queueId = q.id;
      const members = (q.members as string[]) ?? [];
      data.followers = [
        ...new Set([...((t.followers as string[]) ?? []), ...members]),
      ];
      toLabel = `Escalations queue${
        members.length
          ? ' (' +
            members
              .map((m) => L.agents.find((a) => a.id === m)?.name)
              .filter(Boolean)
              .join(', ') +
            ')'
          : ''
      }`;
      notifyIds = members;
    } else {
      const a = await this.ctx.assertAgent(actor.rootId, dto.to);
      data.agentUserId = a!.id;
      if (t.status === 'New') data.status = 'Open';
      toLabel = a!.name;
      notifyIds = [a!.id];
    }
    const pri =
      dto.priority && dto.priority !== t.priority ? dto.priority : null;
    if (pri) {
      if (!(PRIORITIES as readonly string[]).includes(pri))
        throw bad('Unknown priority.');
      data.priority = pri;
    }
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data,
    });
    await this.ops.sys(
      n,
      actor,
      `Escalated to ${toLabel} · reason: ${dto.reason}${pri ? ` · priority ${t.priority} → ${pri}` : ''}`,
    );
    if (dto.note?.trim())
      await this.prisma.helpdeskMessage.create({
        data: {
          businessId: t.businessId,
          ticketId: t.id,
          kind: 'note',
          authorUserId: actor.userId,
          authorName: actor.name,
          body: dto.note.trim(),
        },
      });
    const sent = await this.ctx.notify(
      actor.rootId,
      notifyIds,
      'Escalation',
      {
        title: `${t.number} escalated to you`,
        body: `${t.subject} · ${dto.reason}`,
        link: `/helpdesk/tickets/${t.number}`,
      },
      { except: actor.userId, cfg },
    );
    await this.prisma.helpdeskEscalation.create({
      data: {
        businessId: actor.rootId,
        ticketId: t.id,
        trigger: `Manual · ${dto.reason}`,
        target: toLabel.slice(0, 191),
        result: `Escalated by ${actor.name} · ${sent.summary}`.slice(0, 500),
        status: 'Succeeded',
      },
    });
    await this.ctx.log(
      actor.rootId,
      actor,
      'Escalated',
      `${t.number} → ${toLabel} · ${dto.reason}`,
      t.id,
    );
    return this.ops.fresh(t.id);
  }

  // ── merge / split / links / delete ───────────────────────────────────────

  async merge(actor: HdActor, dto: MergeDto) {
    const cfg = await this.ctx.config(actor.rootId);
    if (!cfg.advanced.ticketMerge)
      throw conflict('Merging is turned off in Settings › Advanced.');
    this.ctx.assert(actor, cfg, 'Merge', 'Merging');
    const target = (await this.visibleTicket(actor, dto.target)).t;
    const sources: HelpdeskTicket[] = [];
    for (const n of dto.sources.filter((x) => x !== dto.target))
      sources.push((await this.visibleTicket(actor, n)).t);
    if (!sources.length) throw bad('Pick at least one other ticket to merge.');
    for (const s of [target, ...sources])
      if (!isOpenStatus(s.status))
        throw conflict(
          `${s.number} isn’t open — only open tickets can be merged.`,
        );
    const other = sources.find((s) => s.customerId !== target.customerId);
    if (other) {
      const c = await this.prisma.customer.findUnique({
        where: { id: other.customerId },
        select: { name: true },
      });
      throw conflict(
        `Can’t merge: ${other.number} belongs to a different customer (${c?.name ?? 'another customer'}).`,
      );
    }
    for (const s of sources) {
      const moved = await this.prisma.helpdeskMessage.findMany({
        where: { ticketId: s.id, kind: { not: 'sys' } },
        orderBy: { createdAt: 'asc' },
      });
      const nAtt = moved.reduce(
        (a, m) => a + ((m.attachments as unknown[]) ?? []).length,
        0,
      );
      const cur = await this.ops.fresh(target.id);
      const links = await this.prisma.helpdeskLink.findMany({
        where: { ticketId: s.id },
      });
      await this.prisma.$transaction(async (tx) => {
        for (const m of moved)
          await tx.helpdeskMessage.create({
            data: {
              businessId: m.businessId,
              ticketId: target.id,
              kind: m.kind,
              authorUserId: m.authorUserId,
              authorName: m.authorName,
              body: m.body,
              attachments: m.attachments as Prisma.InputJsonValue,
              fromLabel: `From ${s.number}`,
              via: m.via,
              delivery: m.delivery,
              deliveryNote: m.deliveryNote,
              createdAt: m.createdAt,
            },
          });
        for (const l of links)
          await tx.helpdeskLink.upsert({
            where: {
              ticketId_type_refId: {
                ticketId: target.id,
                type: l.type,
                refId: l.refId,
              },
            },
            create: {
              businessId: l.businessId,
              ticketId: target.id,
              type: l.type,
              refId: l.refId,
              label: l.label,
            },
            update: {},
          });
        await tx.helpdeskTicket.update({
          where: { id: target.id },
          data: {
            tags: [
              ...new Set([
                ...((cur.tags as string[]) ?? []),
                ...((s.tags as string[]) ?? []),
              ]),
            ],
            followers: [
              ...new Set([
                ...((cur.followers as string[]) ?? []),
                ...((s.followers as string[]) ?? []),
              ]),
            ],
            mergedFrom: [
              ...((cur.mergedFrom as unknown[]) ?? []),
              {
                number: s.number,
                channel: s.channel,
                conversationId: s.conversationId,
              },
            ] as Prisma.InputJsonValue,
            conversationId: cur.conversationId ?? s.conversationId,
            firstResponseAt: cur.firstResponseAt ?? s.firstResponseAt,
            lastActivityAt: new Date(),
          },
        });
        await tx.helpdeskTicket.update({
          where: { id: s.id },
          data: {
            status: 'Closed',
            mergedIntoId: target.id,
            closedAt: new Date(),
            resolvedAt: s.resolvedAt ?? new Date(),
            pausedSince: null,
          },
        });
      });
      await this.ops.sys(
        target,
        actor,
        `Merged ${s.number} into this ticket · ${moved.length} messages/notes and ${nAtt} attachment(s) preserved · source ${s.channel}`,
      );
      await this.ops.sys(
        s,
        actor,
        `Merged into ${target.number}. Closed; full history kept for audit.`,
      );
      await this.ctx.log(
        actor.rootId,
        actor,
        'Merged',
        `${s.number} → ${target.number} (${moved.length} items, ${nAtt} attachments)`,
        target.id,
      );
    }
    return this.ops.fresh(target.id);
  }

  async split(actor: HdActor, number: string, dto: SplitDto) {
    const { t, L } = await this.visibleTicket(actor, number);
    if (!L.cfg.advanced.split)
      throw conflict('Splitting is turned off in Settings › Advanced.');
    if (t.status === 'Closed') throw conflict('Closed tickets can’t be split.');
    const pick = await this.prisma.helpdeskMessage.findMany({
      where: {
        ticketId: t.id,
        id: { in: dto.messageIds },
        kind: { not: 'sys' },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!pick.length)
      throw bad(
        'Tick at least one message or note to move into the new ticket.',
      );
    const n = await this.create(actor, actor.rootId, {
      customerId: t.customerId,
      subject: dto.subject,
      description: `Split from ${t.number}`,
      channel: t.channel,
      category: t.category,
      priority: dto.priority,
      agentId: dto.agentId || undefined,
      queueId: t.queueId ?? undefined,
      branchId: t.branchId,
      conversationId: t.conversationId ?? undefined,
      origin: `Ticket created by ${actor.name} · channel ${t.channel} · split from ${t.number}`,
      firstMessages: pick.map((m) => ({
        kind: m.kind,
        by: m.authorName,
        body: m.body,
        at: m.createdAt,
        attachments: (m.attachments as unknown as Attachment[]) ?? [],
        from: `From ${t.number}`,
      })),
    });
    await this.ops.sys(
      t,
      actor,
      `Split ${pick.length} item(s) into ${n.number}`,
    );
    await this.ctx.log(
      actor.rootId,
      actor,
      'Split',
      `${t.number} → ${n.number} (${pick.length} items)`,
      t.id,
    );
    return n;
  }

  async link(actor: HdActor, number: string, dto: LinkDto) {
    const { t } = await this.visibleTicket(actor, number);
    if (t.status === 'Closed') throw conflict('Ticket is closed.');
    const def = LINK_TYPES[dto.type];
    if (!def) throw bad('Unknown record type.');
    if (!def.available)
      throw bad(def.why ?? `${dto.type} records don’t exist in Noxtill.`);
    const rid = dto.ref.trim().toUpperCase();
    if (!rid.startsWith(def.prefix))
      throw bad(`${dto.type} IDs start with ${def.prefix}`);
    const groupIds = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    let refId: string | null = null;
    const n = Number(rid.slice(def.prefix.length));
    if (dto.type === 'Order' && Number.isInteger(n)) {
      const rows = await this.prisma.order.findMany({
        where: { businessId: { in: groupIds }, orderNo: n },
        select: { id: true, customerId: true },
      });
      refId =
        (rows.find((r) => r.customerId === t.customerId) ?? rows[0])?.id ??
        null;
    } else if (dto.type === 'Booking' && Number.isInteger(n)) {
      const rows = await this.prisma.appointment.findMany({
        where: { businessId: { in: groupIds }, bookingNo: n },
        select: { id: true, customerId: true },
      });
      refId =
        (rows.find((r) => r.customerId === t.customerId) ?? rows[0])?.id ??
        null;
    } else if (dto.type === 'Project') {
      refId =
        (
          await this.prisma.project.findFirst({
            where: { businessId: { in: groupIds }, number: dto.ref.trim() },
            select: { id: true },
          })
        )?.id ?? null;
    }
    if (!refId)
      throw bad(
        `No ${dto.type} ${rid} found in ${def.module}. Only existing records can be linked.`,
      );
    const label = dto.type === 'Project' ? dto.ref.trim() : rid;
    if (
      await this.prisma.helpdeskLink.findUnique({
        where: {
          ticketId_type_refId: { ticketId: t.id, type: dto.type, refId },
        },
      })
    )
      throw conflict(`${label} is already linked.`);
    await this.prisma.helpdeskLink.create({
      data: {
        businessId: actor.rootId,
        ticketId: t.id,
        type: dto.type,
        refId,
        label,
      },
    });
    await this.ops.sys(t, actor, `Linked ${dto.type} ${label}`);
    return { ok: true };
  }

  async unlink(actor: HdActor, number: string, linkId: string) {
    const { t } = await this.visibleTicket(actor, number);
    const l = await this.prisma.helpdeskLink.findFirst({
      where: { id: linkId, ticketId: t.id },
    });
    if (!l)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Link not found.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.helpdeskLink.delete({ where: { id: l.id } });
    await this.ops.sys(t, actor, `Unlinked ${l.type} ${l.label}`);
    return { ok: true };
  }

  /** Delete is allowed only while nothing has reached the customer (no reply, no survey). */
  async remove(actor: HdActor, number: string) {
    const { t, L } = await this.visibleTicket(actor, number);
    this.ctx.assert(actor, L.cfg, 'Delete where allowed', 'Deleting tickets');
    const sent = await this.prisma.helpdeskMessage.count({
      where: { ticketId: t.id, kind: 'reply', delivery: { not: 'failed' } },
    });
    const csat = await this.prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    if (sent || (csat && csat.status !== 'scheduled'))
      throw conflict(
        'This ticket has replies or a survey the customer received — close it instead so the history is kept.',
      );
    if (
      await this.prisma.helpdeskTicket.count({ where: { mergedIntoId: t.id } })
    )
      throw conflict(
        'Other tickets were merged into this one — close it instead.',
      );
    await this.prisma.helpdeskCsat.deleteMany({ where: { ticketId: t.id } });
    await this.prisma.helpdeskTicket.delete({ where: { id: t.id } });
    await this.ctx.log(
      actor.rootId,
      actor,
      'Ticket deleted',
      `${t.number} · ${t.subject}`,
    );
    return { ok: true };
  }

  // ── bulk ─────────────────────────────────────────────────────────────────

  async bulk(actor: HdActor, dto: BulkDto) {
    const cfg = await this.ctx.config(actor.rootId);
    let done = 0;
    const skipped: Array<{ number: string; why: string }> = [];
    for (const number of dto.numbers) {
      try {
        const { t } = await this.visibleTicket(actor, number);
        const v = (dto.value ?? '').trim();
        if (dto.action === 'assign') {
          this.ctx.assert(
            actor,
            cfg,
            t.agentUserId ? 'Reassign' : 'Assign',
            'Assigning',
          );
          await this.ops.assign(t, v || null, actor, cfg);
        } else if (dto.action === 'status')
          await this.changeStatus(actor, cfg, t, v);
        else if (dto.action === 'priority') {
          this.ctx.assert(actor, cfg, 'Change priority', 'Changing priority');
          await this.ops.setPriority(t, v, actor);
        } else if (dto.action === 'tag') {
          if (!normalizeTag(v)) throw bad('Enter a tag.');
          await this.ops.addTag(t, v, actor, true);
        } else if (dto.action === 'queue') {
          this.ctx.assert(actor, cfg, 'Reassign', 'Moving queues');
          await this.ops.setQueue(t, v, actor);
        } else if (dto.action === 'close')
          await this.changeStatus(
            actor,
            cfg,
            t,
            'Closed',
            dto.note?.trim() || undefined,
          );
        else if (dto.action === 'resolve')
          await this.changeStatus(
            actor,
            cfg,
            t,
            'Resolved',
            dto.note?.trim() || undefined,
          );
        done++;
      } catch (e) {
        skipped.push({ number, why: (e as Error).message });
      }
    }
    return { done, skipped };
  }

  async assignMany(actor: HdActor, numbers: string[], agentId: string) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assertManager(actor, 'Assigning from the workload view');
    let done = 0;
    const skipped: Array<{ number: string; why: string }> = [];
    for (const number of numbers) {
      try {
        const { t } = await this.visibleTicket(actor, number);
        await this.ops.assign(t, agentId, actor, cfg);
        done++;
      } catch (e) {
        skipped.push({ number, why: (e as Error).message });
      }
    }
    return { done, skipped };
  }

  async rebalance(actor: HdActor, apply: boolean) {
    this.ctx.assertManager(actor, 'Rebalancing');
    const cfg = await this.ctx.config(actor.rootId);
    const { all, agents, queues } = await this.ops.loadAll(actor.rootId, cfg);
    const plan = this.ops.rebalancePlan(all, agents, queues);
    const name = (id: string) => agents.find((a) => a.id === id)?.name ?? '—';
    if (apply) {
      for (const p of plan)
        await this.ops.assign(
          await this.ops.fresh(p.id),
          p.to,
          actor,
          cfg,
          '(rebalance)',
        );
      await this.ctx.log(
        actor.rootId,
        actor,
        'Rebalanced',
        `${plan.length} tickets moved`,
      );
    }
    return {
      plan: plan.map((p) => ({
        number: p.number,
        from: name(p.from),
        to: name(p.to),
      })),
      applied: apply,
    };
  }

  // ── replies & notes ──────────────────────────────────────────────────────

  async reply(
    actor: HdActor,
    number: string,
    dto: ReplyDto,
    files: UploadedFile[] = [],
  ) {
    const { t, L } = await this.visibleTicket(actor, number);
    const cfg = L.cfg;
    const note = dto.mode === 'note';
    this.ctx.assert(
      actor,
      cfg,
      note ? 'Add internal notes' : 'Reply',
      note ? 'Adding notes' : 'Replying',
    );
    if (t.status === 'Closed')
      throw conflict('Ticket is closed — reopen it to reply.');
    const text = (dto.text ?? '').trim();
    if (!text && !files.length) throw bad('Write something first.');
    if (!note && cfg.advanced.collision && dto.since && dto.force !== 'true') {
      const other = await this.prisma.helpdeskMessage.findFirst({
        where: {
          ticketId: t.id,
          kind: 'reply',
          createdAt: { gt: new Date(dto.since) },
          NOT: { authorUserId: actor.userId },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (other)
        throw new AppException(
          'HELPDESK_COLLISION',
          `${other.authorName} replied to this ticket ${fmtM((Date.now() - other.createdAt.getTime()) / 60000)} ago while you were writing. Review it, then send again to reply anyway.`,
          HttpStatus.CONFLICT,
        );
    }
    const atts = await this.storeFiles(actor.rootId, files);
    if (dto.articles) {
      const ids = dto.articles.split(',').filter(Boolean);
      if (ids.length)
        await this.prisma.helpdeskArticle.updateMany({
          where: { businessId: actor.rootId, id: { in: ids } },
          data: { linkedCount: { increment: 1 } },
        });
    }
    if (note) {
      await this.prisma.helpdeskMessage.create({
        data: {
          businessId: actor.rootId,
          ticketId: t.id,
          kind: 'note',
          authorUserId: actor.userId,
          authorName: actor.name,
          body: text,
          attachments: atts as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.helpdeskTicket.update({
        where: { id: t.id },
        data: { lastActivityAt: new Date(), lastKind: 'note' },
      });
      await this.ctx.log(
        actor.rootId,
        actor,
        'Internal note added',
        t.number,
        t.id,
      );
      return { ok: true, delivery: 'note' };
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
      select: { name: true },
    });
    const body =
      text +
      (cfg.comms.signature
        ? '\n\n' +
          fillVars(cfg.comms.signature, {
            customer: customer?.name ?? '',
            ticket: t.number,
            agent: actor.name,
          })
        : '');
    const r = await this.delivery.send(t, body, actor, atts.length > 0);
    const now = new Date();
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: actor.rootId,
        ticketId: t.id,
        kind: 'reply',
        authorUserId: actor.userId,
        authorName: actor.name,
        body,
        attachments: atts as unknown as Prisma.InputJsonValue,
        inboxMessageId: r.inboxMessageId,
        via: r.via,
        delivery: r.delivery,
        deliveryNote: r.note.slice(0, 500),
        createdAt: now,
      },
    });
    const visible = r.delivery !== 'failed';
    await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: {
        lastActivityAt: now,
        lastKind: 'reply',
        ...(visible && !t.firstResponseAt ? { firstResponseAt: now } : {}),
        ...(t.status === 'New' ? { status: 'Open' } : {}),
        ...(!t.conversationId && r.conversationId
          ? { conversationId: r.conversationId }
          : {}),
      },
    });
    await this.ctx.log(
      actor.rootId,
      actor,
      visible ? 'Public reply sent' : 'Public reply not delivered',
      `${t.number} via ${r.via}`,
      t.id,
    );
    if (dto.after) {
      const cur = await this.ops.fresh(t.id);
      if (dto.after !== cur.status)
        await this.changeStatus(actor, cfg, cur, dto.after);
    }
    return { ok: visible, delivery: r.delivery, note: r.note };
  }

  async retry(actor: HdActor, number: string, messageId: string) {
    const { t, L } = await this.visibleTicket(actor, number);
    this.ctx.assert(actor, L.cfg, 'Reply', 'Replying');
    const m = await this.prisma.helpdeskMessage.findFirst({
      where: { id: messageId, ticketId: t.id, kind: 'reply' },
    });
    if (!m)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Message not found.',
        HttpStatus.NOT_FOUND,
      );
    const st = m.inboxMessageId
      ? (await this.delivery.statuses([m.inboxMessageId])).get(m.inboxMessageId)
      : null;
    if (m.delivery !== 'failed' && st?.status !== 'failed')
      throw conflict('This reply was not a failed delivery.');
    const r = await this.delivery.send(
      t,
      m.body,
      actor,
      ((m.attachments as unknown[]) ?? []).length > 0,
    );
    await this.prisma.helpdeskMessage.update({
      where: { id: m.id },
      data: {
        inboxMessageId: r.inboxMessageId ?? m.inboxMessageId,
        via: r.via,
        delivery: r.delivery,
        deliveryNote: `${r.note} (retried)`.slice(0, 500),
      },
    });
    if (r.delivery !== 'failed' && !t.firstResponseAt)
      await this.prisma.helpdeskTicket.update({
        where: { id: t.id },
        data: { firstResponseAt: new Date() },
      });
    await this.ctx.log(
      actor.rootId,
      actor,
      'Delivery retried',
      `${t.number} · ${r.delivery}`,
      t.id,
    );
    return { ok: r.delivery !== 'failed', note: r.note };
  }

  // ── Unified Inbox mirroring ──────────────────────────────────────────────

  /** The live ticket for a conversation (following merges), if any. */
  private async ticketForConversation(
    conversationId: string,
  ): Promise<HelpdeskTicket | null> {
    let t = await this.prisma.helpdeskTicket.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    for (let i = 0; t?.mergedIntoId && i < 10; i++)
      t = await this.prisma.helpdeskTicket.findUnique({
        where: { id: t.mergedIntoId },
      });
    return t;
  }

  /**
   * A customer wrote on a conversation that has a ticket: it lands on the ticket. A resolved ticket
   * reopens inside the reopen window; after that — or once closed — a follow-up ticket is opened.
   */
  async onInbound(e: InboxHookEvent) {
    if (e.backfill) return;
    const t = await this.ticketForConversation(e.conversation.id);
    if (!t) return;
    const cfg = await this.ctx.config(t.businessId);
    const name = e.conversation.contactName;
    const win = this.ops.reopenWindowDays(cfg);
    let cur = t;
    if (!isOpenStatus(t.status)) {
      const resolvedAt = t.resolvedAt ?? t.closedAt ?? t.updatedAt;
      const inWindow =
        t.status === 'Resolved' &&
        win != null &&
        Date.now() - resolvedAt.getTime() <= win * 86400000;
      if (!inWindow) {
        await this.create(null, t.businessId, {
          customerId: t.customerId,
          subject: `Follow-up: ${t.subject}`.slice(0, 300),
          description: e.message.body,
          channel: t.channel,
          category: t.category,
          priority: t.priority,
          branchId: t.branchId,
          conversationId: e.conversation.id,
          origin: `Ticket created from ${this.delivery.label(e.conversation.channel)} via Unified Inbox · follow-up to ${t.number} (customer wrote after it was ${t.status.toLowerCase()})`,
          firstMessages: [
            {
              kind: 'cust',
              by: name,
              body: e.message.body,
              at: e.message.createdAt,
              inboxMessageId: e.message.id,
            },
          ],
        });
        return;
      }
      cur = await this.ops.reopen(t, SYSTEM, `${name} replied`);
    }
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: t.businessId,
        ticketId: cur.id,
        kind: 'cust',
        authorName: name.slice(0, 191),
        body: e.message.body,
        inboxMessageId: e.message.id,
        createdAt: e.message.createdAt,
      },
    });
    await this.prisma.helpdeskTicket.update({
      where: { id: cur.id },
      data: { lastActivityAt: new Date(), lastKind: 'cust' },
    });
    if (cur.status === 'Waiting on Customer')
      cur = await this.ops.setStatus(cur, 'Open', SYSTEM, cfg);
    await this.ctx.notify(
      t.businessId,
      [cur.agentUserId, ...((cur.followers as string[]) ?? [])],
      'Customer reply',
      {
        title: `${name} replied on ${cur.number}`,
        body: e.message.body.slice(0, 200),
        link: `/helpdesk/tickets/${cur.number}`,
      },
      { cfg },
    );
  }

  /** A reply sent from Unified Inbox (not from Helpdesk) shows on the ticket too. */
  async onOutbound(e: InboxHookEvent) {
    if (e.message.source === 'helpdesk') return;
    const t = await this.ticketForConversation(e.conversation.id);
    if (!t || !isOpenStatus(t.status)) return;
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: t.businessId,
        ticketId: t.id,
        kind: 'reply',
        authorUserId: e.message.authorUserId,
        authorName: (e.message.authorName ?? 'Team').slice(0, 191),
        body: e.message.body,
        inboxMessageId: e.message.id,
        via: this.delivery.label(e.conversation.channel),
        delivery: 'sent',
        deliveryNote: 'Sent from Unified Inbox',
        fromLabel: 'Unified Inbox',
      },
    });
    await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: {
        lastActivityAt: new Date(),
        lastKind: 'reply',
        ...(t.firstResponseAt ? {} : { firstResponseAt: e.message.createdAt }),
        ...(t.status === 'New' ? { status: 'Open' } : {}),
      },
    });
  }
}
