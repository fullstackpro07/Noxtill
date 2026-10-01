import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { HdActor, HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskOpsService } from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import { HelpdeskTicketsService, fillVars } from './helpdesk-tickets.service';
import {
  ARTICLE_VISIBILITY,
  HD_ERRORS,
  MACRO_ACTIONS,
  PRIORITIES,
  REPLY_VARIABLES,
} from './helpdesk.constants';
import { ArticleDto, MacroDto, SavedReplyDto } from './dto/helpdesk.dto';
import { conditionsMatch, parseConditions } from './helpdesk-conditions.util';

const bad = (m: string) =>
  new AppException(HD_ERRORS.INVALID, m, HttpStatus.BAD_REQUEST);
const notFound = (m: string) =>
  new AppException(HD_ERRORS.NOT_FOUND, m, HttpStatus.NOT_FOUND);
const forbidden = (m: string) =>
  new AppException(HD_ERRORS.FORBIDDEN, m, HttpStatus.FORBIDDEN);
const STALE_DAYS = 30;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

/** Knowledge base, saved replies and macros. */
@Injectable()
export class HelpdeskContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly ops: HelpdeskOpsService,
    private readonly tickets: HelpdeskTicketsService,
    private readonly delivery: HelpdeskDeliveryService,
  ) {}

  // ── knowledge base ───────────────────────────────────────────────────────

  async articles(actor: HdActor) {
    const rootId = actor.rootId;
    const cfg = await this.ctx.config(rootId);
    const [rows, events, versions] = await Promise.all([
      this.prisma.helpdeskArticle.findMany({
        where: { businessId: rootId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.helpdeskArticleEvent.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.helpdeskArticleVersion.findMany({
        where: { businessId: rootId },
        orderBy: { version: 'desc' },
      }),
    ]);
    const since90 = Date.now() - 90 * 86400000;
    const now = Date.now();
    const list = rows.map((a) => {
      const ev = events.filter((e) => e.articleId === a.id);
      const views = ev.filter(
        (e) => e.kind === 'view' && e.createdAt.getTime() >= since90,
      ).length;
      const up = ev.filter((e) => e.kind === 'helpful').length;
      const down = ev.filter((e) => e.kind === 'unhelpful').length;
      const reviewed = a.reviewedAt ?? a.createdAt;
      return {
        id: a.id,
        title: a.title,
        slug: a.slug,
        category: a.category,
        summary: a.summary ?? '',
        body: a.body,
        tags: (a.tags as string[]) ?? [],
        visibility: a.visibility,
        related: (a.related as string[]) ?? [],
        status: a.status,
        author: a.authorName,
        version: a.version,
        updatedAt: a.updatedAt.toISOString(),
        updatedDays: Math.floor((now - a.updatedAt.getTime()) / 86400000),
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
        stale:
          a.status !== 'Archived' &&
          now - reviewed.getTime() > STALE_DAYS * 86400000,
        views,
        votes: up + down,
        helpful: up + down ? Math.round((up / (up + down)) * 100) : null,
        linked: a.linkedCount,
        feedback: ev
          .filter((e) => e.kind !== 'view' && e.comment)
          .slice(0, 10)
          .map((e) => ({
            text: e.comment!,
            helpful: e.kind === 'helpful',
            source: e.source,
            at: e.createdAt.toISOString(),
          })),
        versions: versions
          .filter((v) => v.articleId === a.id)
          .map((v) => ({
            v: v.version,
            by: v.authorName,
            at: v.createdAt.toISOString(),
            note: v.note,
          })),
      };
    });
    return {
      articles: list,
      categories: cfg.kbCategories,
      canPublish: actor.ri <= 1,
    };
  }

  async saveArticle(actor: HdActor, id: string | null, dto: ArticleDto) {
    const rootId = actor.rootId;
    const cfg = await this.ctx.config(rootId);
    if (!cfg.kbCategories.includes(dto.category))
      throw bad('Unknown knowledge category.');
    if (!ARTICLE_VISIBILITY.includes(dto.visibility))
      throw bad('Unknown visibility.');
    const slug = slugify(dto.slug || dto.title);
    if (!slug) throw bad('Slug can’t be empty.');
    const clash = await this.prisma.helpdeskArticle.findFirst({
      where: { businessId: rootId, slug, ...(id ? { NOT: { id } } : {}) },
    });
    if (clash) throw bad(`Slug “${slug}” is already used.`);
    const status = actor.ri <= 1 ? dto.status : 'Draft';
    if (!['Draft', 'Published', 'Archived'].includes(status))
      throw bad('Unknown status.');
    const related = await this.prisma.helpdeskArticle.findMany({
      where: { businessId: rootId, id: { in: dto.related } },
      select: { id: true },
    });
    const data = {
      title: dto.title.trim(),
      slug,
      category: dto.category,
      summary: dto.summary?.trim() || null,
      body: dto.body ?? '',
      tags: (dto.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      visibility: dto.visibility,
      related: related.map((r) => r.id).filter((r) => r !== id),
      status,
    };
    let articleId = id;
    if (id) {
      const a = await this.prisma.helpdeskArticle.findFirst({
        where: { id, businessId: rootId },
      });
      if (!a) throw notFound('Article not found.');
      const version = a.version + 1;
      await this.prisma.helpdeskArticle.update({
        where: { id },
        data: { ...data, version },
      });
      await this.prisma.helpdeskArticleVersion.create({
        data: {
          businessId: rootId,
          articleId: id,
          version,
          title: data.title,
          summary: data.summary,
          body: data.body,
          note: `Edited by ${actor.name}`,
          authorName: actor.name,
        },
      });
    } else {
      const a = await this.prisma.helpdeskArticle.create({
        data: {
          businessId: rootId,
          ...data,
          authorUserId: actor.userId,
          authorName: actor.name,
          reviewedAt: new Date(),
        },
      });
      articleId = a.id;
      await this.prisma.helpdeskArticleVersion.create({
        data: {
          businessId: rootId,
          articleId: a.id,
          version: 1,
          title: data.title,
          summary: data.summary,
          body: data.body,
          note: 'Created',
          authorName: actor.name,
        },
      });
    }
    await this.ctx.log(
      rootId,
      actor,
      `Article ${id ? 'updated' : 'created'}`,
      `${data.title} · ${status} · ${data.visibility}`,
    );
    return { id: articleId, status };
  }

  async articleAction(actor: HdActor, id: string, action: string) {
    this.ctx.assertManager(
      actor,
      'Publishing, archiving and reviewing articles',
    );
    const a = await this.prisma.helpdeskArticle.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!a) throw notFound('Article not found.');
    const data: Prisma.HelpdeskArticleUpdateInput =
      action === 'review'
        ? { reviewedAt: new Date() }
        : action === 'publish'
          ? { status: 'Published' }
          : action === 'unpublish'
            ? { status: 'Draft' }
            : action === 'archive'
              ? { status: 'Archived' }
              : { status: 'Draft' };
    if (action === 'publish' && a.status === 'Archived')
      throw bad('Restore the article first.');
    await this.prisma.helpdeskArticle.update({ where: { id }, data });
    await this.ctx.log(
      actor.rootId,
      actor,
      `Article ${action === 'review' ? 'reviewed' : action + (action.endsWith('e') ? 'd' : 'ed')}`,
      a.title,
    );
    return { ok: true };
  }

  async addKbCategory(actor: HdActor, name: string) {
    this.ctx.assertManager(actor, 'Creating knowledge categories');
    const row = await this.ctx.settingsRow(actor.rootId);
    const cfg = await this.ctx.config(actor.rootId);
    const n = name.trim();
    if (cfg.kbCategories.some((c) => c.toLowerCase() === n.toLowerCase()))
      throw bad('Category exists.');
    await this.prisma.helpdeskSettings.update({
      where: { id: row.id },
      data: {
        config: {
          ...cfg,
          kbCategories: [...cfg.kbCategories, n],
        },
      },
    });
    await this.ctx.log(actor.rootId, actor, 'Knowledge category created', n);
    return { ok: true };
  }

  async articleViewed(actor: HdActor, id: string) {
    const a = await this.prisma.helpdeskArticle.findFirst({
      where: { id, businessId: actor.rootId },
      select: { id: true },
    });
    if (!a) throw notFound('Article not found.');
    await this.prisma.helpdeskArticleEvent.create({
      data: {
        businessId: actor.rootId,
        articleId: id,
        kind: 'view',
        source: 'agent',
      },
    });
    return { ok: true };
  }

  // ── saved replies ────────────────────────────────────────────────────────

  private visibleReply(
    actor: HdActor,
    r: { visibility: string; ownerUserId: string },
  ) {
    if (r.visibility === 'Only me') return r.ownerUserId === actor.userId;
    if (r.visibility === 'Managers only') return actor.ri <= 1;
    return true;
  }

  async library(actor: HdActor) {
    const [replies, macros] = await Promise.all([
      this.prisma.helpdeskSavedReply.findMany({
        where: { businessId: actor.rootId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.helpdeskMacro.findMany({
        where: { businessId: actor.rootId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      canEdit: actor.ri <= 1,
      replies: replies
        .filter((r) => this.visibleReply(actor, r))
        .map((r) => ({
          id: r.id,
          name: r.name,
          shortcut: r.shortcut,
          body: r.body,
          visibility: r.visibility,
          team: r.team,
          usage: r.usage,
          by: r.ownerName,
          mine: r.ownerUserId === actor.userId,
          canEdit:
            actor.ri <= 1 ||
            (r.ownerUserId === actor.userId && r.visibility === 'Only me'),
        })),
      macros: macros.map((m) => ({
        id: m.id,
        name: m.name,
        conditions: m.conditions,
        actions: (m.actions as string[][]) ?? [],
        status: m.status,
        usage: m.usage,
      })),
    };
  }

  async saveReply(actor: HdActor, id: string | null, dto: SavedReplyDto) {
    const rootId = actor.rootId;
    const sc = dto.shortcut.trim();
    if (!/^\/[a-z-]+$/.test(sc)) throw bad('Shortcut must look like /refund.');
    const badVar = [...dto.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)]
      .map((m) => m[1])
      .filter((v) => !REPLY_VARIABLES.includes(v));
    if (badVar.length)
      throw bad(
        `Unsupported variable: {{${badVar[0]}}}. Allowed: customer_name, ticket_number, agent_name.`,
      );
    if (!['All agents', 'Managers only', 'Only me'].includes(dto.visibility))
      throw bad('Unknown visibility.');
    const visibility = actor.ri <= 1 ? dto.visibility : 'Only me';
    const clash = await this.prisma.helpdeskSavedReply.findFirst({
      where: {
        businessId: rootId,
        shortcut: sc,
        ...(id ? { NOT: { id } } : {}),
      },
    });
    if (clash) throw bad(`${sc} is already used.`);
    const data = {
      name: dto.name.trim(),
      shortcut: sc,
      body: dto.body,
      visibility,
      team: dto.team || 'All queues',
    };
    if (id) {
      const r = await this.prisma.helpdeskSavedReply.findFirst({
        where: { id, businessId: rootId },
      });
      if (!r) throw notFound('Saved reply not found.');
      if (!(
        actor.ri <= 1 ||
        (r.ownerUserId === actor.userId && r.visibility === 'Only me')
      ))
        throw forbidden('You can only edit your own private saved replies.');
      await this.prisma.helpdeskSavedReply.update({ where: { id }, data });
    } else
      await this.prisma.helpdeskSavedReply.create({
        data: {
          businessId: rootId,
          ...data,
          ownerUserId: actor.userId,
          ownerName: actor.name,
        },
      });
    await this.ctx.log(
      rootId,
      actor,
      'Saved reply saved',
      `${data.name} ${sc}`,
    );
    return { ok: true };
  }

  async duplicateReply(actor: HdActor, id: string) {
    const r = await this.prisma.helpdeskSavedReply.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!r || !this.visibleReply(actor, r))
      throw notFound('Saved reply not found.');
    let sc = `${r.shortcut}-copy`;
    for (
      let i = 2;
      await this.prisma.helpdeskSavedReply.findFirst({
        where: { businessId: actor.rootId, shortcut: sc },
      });
      i++
    )
      sc = `${r.shortcut}-copy-${'abcdefghij'[i % 10]}`;
    await this.prisma.helpdeskSavedReply.create({
      data: {
        businessId: actor.rootId,
        name: `${r.name} (copy)`.slice(0, 120),
        shortcut: sc,
        body: r.body,
        visibility: actor.ri <= 1 ? r.visibility : 'Only me',
        team: r.team,
        ownerUserId: actor.userId,
        ownerName: actor.name,
      },
    });
    return { ok: true };
  }

  async deleteReply(actor: HdActor, id: string) {
    const r = await this.prisma.helpdeskSavedReply.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!r) throw notFound('Saved reply not found.');
    if (!(
      actor.ri <= 1 ||
      (r.ownerUserId === actor.userId && r.visibility === 'Only me')
    ))
      throw forbidden('You can only delete your own private saved replies.');
    await this.prisma.helpdeskSavedReply.delete({ where: { id } });
    await this.ctx.log(actor.rootId, actor, 'Deleted reply', r.name);
    return { ok: true };
  }

  // ── macros ───────────────────────────────────────────────────────────────

  async saveMacro(actor: HdActor, id: string | null, dto: MacroDto) {
    this.ctx.assertManager(actor, 'Editing macros');
    const acts = dto.actions
      .filter(
        (a) =>
          Array.isArray(a) &&
          MACRO_ACTIONS.includes(a[0]) &&
          String(a[1] ?? '').trim(),
      )
      .map((a) => [a[0], String(a[1]).trim()]);
    if (!acts.length) throw bad('Add at least one action.');
    const parsed = parseConditions(dto.conditions ?? '');
    if (!parsed.ok) throw bad(parsed.error);
    const data = {
      name: dto.name.trim(),
      conditions: (dto.conditions ?? '').trim() || 'Any ticket',
      actions: acts,
      status: dto.status,
    };
    if (id) {
      const m = await this.prisma.helpdeskMacro.findFirst({
        where: { id, businessId: actor.rootId },
      });
      if (!m) throw notFound('Macro not found.');
      await this.prisma.helpdeskMacro.update({ where: { id }, data });
    } else
      await this.prisma.helpdeskMacro.create({
        data: { businessId: actor.rootId, ...data },
      });
    await this.ctx.log(actor.rootId, actor, 'Macro saved', data.name);
    return { ok: true };
  }

  async macroStatus(
    actor: HdActor,
    id: string,
    status: 'Active' | 'Disabled' | 'delete',
  ) {
    this.ctx.assertManager(actor, 'Editing macros');
    const m = await this.prisma.helpdeskMacro.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!m) throw notFound('Macro not found.');
    if (status === 'delete')
      await this.prisma.helpdeskMacro.delete({ where: { id } });
    else
      await this.prisma.helpdeskMacro.update({
        where: { id },
        data: { status },
      });
    await this.ctx.log(
      actor.rootId,
      actor,
      status === 'delete'
        ? 'Deleted macro'
        : `Macro ${status === 'Active' ? 'enabled' : 'disabled'}`,
      m.name,
    );
    return { ok: true };
  }

  /**
   * Composer "Insert saved reply / macro / article". Replies and articles return text (never sent
   * by themselves). A macro runs its actions with the applying agent's permissions — anything they
   * aren't allowed to do is skipped and reported, never forced.
   */
  async apply(actor: HdActor, number: string, ref: string, mode: string) {
    const { t, L } = await this.tickets.visibleTicket(actor, number);
    const cfg = L.cfg;
    const [type, id] = ref.split(':');
    const customer = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
      select: { name: true },
    });
    const vars = {
      customer: customer?.name ?? '',
      ticket: t.number,
      agent: actor.name,
    };
    if (type === 'r') {
      const r = await this.prisma.helpdeskSavedReply.findFirst({
        where: { id, businessId: actor.rootId },
      });
      if (!r || !this.visibleReply(actor, r))
        throw notFound('Saved reply not found.');
      await this.prisma.helpdeskSavedReply.update({
        where: { id },
        data: { usage: { increment: 1 } },
      });
      return {
        text: fillVars(r.body, vars),
        mode: 'public',
        done: [],
        skipped: [],
      };
    }
    if (type === 'k') {
      const a = await this.prisma.helpdeskArticle.findFirst({
        where: { id, businessId: actor.rootId, status: 'Published' },
      });
      if (!a) throw notFound('Article not found or not published.');
      if (a.visibility === 'Internal Only' && mode !== 'note')
        throw bad('Internal-only articles can’t be sent to customers.');
      const root = await this.prisma.business.findUnique({
        where: { id: actor.rootId },
        select: { slug: true },
      });
      const url =
        a.visibility === 'Public'
          ? `${this.delivery.helpCenterUrl(root!.slug)}?article=${a.slug}`
          : `${this.delivery.portalUrl(t.portalToken)}?article=${a.slug}`;
      return {
        text:
          a.visibility === 'Internal Only'
            ? `Internal article: ${a.title}`
            : `Help article: ${a.title} — ${url}`,
        articleId: a.id,
        done: [],
        skipped: [],
      };
    }
    const mac = await this.prisma.helpdeskMacro.findFirst({
      where: { id, businessId: actor.rootId, status: 'Active' },
    });
    if (!mac) throw notFound('Macro not found or disabled.');
    if (t.status === 'Closed')
      throw bad('Ticket is closed — reopen it to apply a macro.');
    const cond = parseConditions(mac.conditions);
    const row = L.all[0];
    if (
      cond.ok &&
      !conditionsMatch(cond.conds, {
        category: t.category,
        queue: row?.queueName ?? null,
        channel: t.channel,
        status: t.status,
        priority: t.priority,
        branch: row?.branchName ?? null,
        tags: (t.tags as string[]) ?? [],
      })
    )
      throw bad(
        `“${mac.name}” only applies when ${mac.conditions} — this ticket doesn’t match.`,
      );
    const done: string[] = [];
    const skipped: string[] = [];
    let text = '';
    let cur = t;
    for (const [a, v] of (mac.actions as string[][]) ?? []) {
      try {
        if (a === 'Insert reply') {
          const r = await this.prisma.helpdeskSavedReply.findFirst({
            where: { businessId: actor.rootId, name: v },
          });
          if (r && this.visibleReply(actor, r)) {
            text = fillVars(r.body, vars);
            await this.prisma.helpdeskSavedReply.update({
              where: { id: r.id },
              data: { usage: { increment: 1 } },
            });
            done.push('reply inserted (not sent)');
          } else skipped.push(`reply “${v}” missing`);
        } else if (a === 'Set status') {
          const cap =
            v === 'Resolved' ? 'Resolve' : v === 'Closed' ? 'Close' : null;
          if (cap && !this.ctx.can(actor, cfg, cap))
            skipped.push(`status ${v} (needs ${cap})`);
          else {
            cur = await this.ops.setStatus(cur, v, actor, cfg);
            done.push(`status ${v}`);
          }
        } else if (a === 'Set priority') {
          if (!this.ctx.can(actor, cfg, 'Change priority'))
            skipped.push('priority (needs Change priority)');
          else if (!(PRIORITIES as readonly string[]).includes(v))
            skipped.push(`priority ${v} unknown`);
          else {
            cur = await this.ops.setPriority(cur, v, actor);
            done.push(`priority ${v}`);
          }
        } else if (a === 'Assign queue') {
          const q = L.queues.find((x) => x.name === v);
          if (!this.ctx.can(actor, cfg, 'Reassign'))
            skipped.push('queue (needs Reassign)');
          else if (!q || !q.active) skipped.push(`queue ${v} unavailable`);
          else {
            cur = await this.ops.setQueue(cur, q.id, actor);
            done.push(`queue ${v}`);
          }
        } else if (a === 'Assign agent') {
          const ag = L.agents.find((x) => x.name === v);
          const need = cur.agentUserId ? 'Reassign' : 'Assign';
          if (!this.ctx.can(actor, cfg, need))
            skipped.push(`agent (needs ${need})`);
          else if (!ag) skipped.push(`agent ${v} isn’t a Helpdesk agent`);
          else {
            cur = await this.ops.assign(cur, ag.id, actor, cfg);
            done.push(`agent ${v}`);
          }
        } else if (a === 'Add tag') {
          for (const g of v.split(','))
            cur = await this.ops.addTag(cur, g, actor, true);
          done.push(`tag ${v}`);
        }
      } catch (e) {
        skipped.push(`${a.toLowerCase()} (${(e as Error).message})`);
      }
    }
    await this.prisma.helpdeskMacro.update({
      where: { id: mac.id },
      data: { usage: { increment: 1 } },
    });
    await this.ops.sys(
      cur,
      actor,
      `Macro “${mac.name}” applied${skipped.length ? ' · skipped: ' + skipped.join(', ') : ''}`,
    );
    return { text, mode: 'public', done, skipped };
  }
}
