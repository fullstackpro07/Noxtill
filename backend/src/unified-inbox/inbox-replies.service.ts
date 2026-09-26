import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { INBOX_ERROR_CODES } from './inbox.constants';
import { InboxFactsService } from './inbox-facts.service';
import { InboxService } from './inbox.service';
import { SavedReplyDto, UpdateSavedReplyDto } from './dto/inbox.dto';

const ALL = 'All replies';

function placeholders(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/\[([^\]]{1,40})\]/g)].map((m) => m[1].trim()),
    ),
  ];
}

@Injectable()
export class InboxRepliesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly facts: InboxFactsService,
    private readonly inbox: InboxService,
  ) {}

  async list(user: AuthenticatedUser, folder?: string, q?: string) {
    const businessId = user.businessId;
    const [replies, folders] = await Promise.all([
      this.tenantPrisma.client.inboxSavedReply.findMany({
        where: { businessId },
        orderBy: [{ useCount: 'desc' }, { title: 'asc' }],
      }),
      this.tenantPrisma.client.inboxReplyFolder.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
      }),
    ]);
    const b = await this.facts.business(businessId);
    const names = [
      ...new Set([
        ...folders.map((f) => f.name),
        ...replies.map((r) => r.folder),
      ]),
    ].sort((a, c) => a.localeCompare(c));
    const search = q?.trim().toLowerCase();
    const shown = replies.filter(
      (r) =>
        (!folder || folder === ALL || r.folder === folder) &&
        (!search ||
          r.title.toLowerCase().includes(search) ||
          r.body.toLowerCase().includes(search) ||
          r.slug.includes(search)),
    );
    const lastUsed = (d: Date | null) => {
      if (!d) return 'never used';
      const mins = Math.round((Date.now() - d.getTime()) / 60000);
      if (mins < 60) return `used ${Math.max(1, mins)} min ago`;
      if (mins < 60 * 24)
        return `used ${Math.round(mins / 60)} hr${Math.round(mins / 60) === 1 ? '' : 's'} ago`;
      if (mins < 60 * 48) return 'used yesterday';
      return `used ${new Intl.DateTimeFormat(b.locale, { day: 'numeric', month: 'short', timeZone: b.timezone }).format(d)}`;
    };
    return {
      folders: [
        { k: ALL, n: replies.length },
        ...names.map((k) => ({
          k,
          n: replies.filter((r) => r.folder === k).length,
        })),
      ],
      replies: shown.map((r) => ({
        id: r.id,
        t: r.title,
        cat: r.folder,
        slug: r.slug,
        used: r.useCount,
        last: lastUsed(r.lastUsedAt),
        text: r.body,
        fillsIn: placeholders(r.body).join(', '),
      })),
    };
  }

  private async assertSlugFree(
    businessId: string,
    slug: string,
    exceptId?: string,
  ) {
    const clash = await this.tenantPrisma.client.inboxSavedReply.findFirst({
      where: {
        businessId,
        slug,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash)
      throw new AppException(
        INBOX_ERROR_CODES.REPLY_SLUG_TAKEN,
        `The shortcut /${slug} is already used by "${clash.title}".`,
        HttpStatus.CONFLICT,
      );
  }

  async create(user: AuthenticatedUser, dto: SavedReplyDto) {
    await this.assertSlugFree(user.businessId, dto.slug);
    return this.tenantPrisma.client.inboxSavedReply.create({
      data: {
        businessId: user.businessId,
        title: dto.title.trim(),
        folder: dto.folder.trim(),
        slug: dto.slug,
        body: dto.body.trim(),
      },
    });
  }

  private async find(user: AuthenticatedUser, id: string) {
    const reply = await this.tenantPrisma.client.inboxSavedReply.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!reply)
      throw new AppException(
        INBOX_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Saved reply not found.',
        HttpStatus.NOT_FOUND,
      );
    return reply;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSavedReplyDto) {
    await this.find(user, id);
    if (dto.slug) await this.assertSlugFree(user.businessId, dto.slug, id);
    const data: Prisma.InboxSavedReplyUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.folder !== undefined) data.folder = dto.folder.trim();
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.body !== undefined) data.body = dto.body.trim();
    return this.tenantPrisma.client.inboxSavedReply.update({
      where: { id },
      data,
    });
  }

  async duplicate(user: AuthenticatedUser, id: string) {
    const src = await this.find(user, id);
    let n = 2;
    let slug = `${src.slug}-${n}`.slice(0, 40);
    while (
      await this.tenantPrisma.client.inboxSavedReply.findFirst({
        where: { businessId: user.businessId, slug },
      })
    ) {
      n++;
      slug = `${src.slug}-${n}`.slice(0, 40);
    }
    return this.tenantPrisma.client.inboxSavedReply.create({
      data: {
        businessId: user.businessId,
        title: `${src.title} (copy)`.slice(0, 120),
        folder: src.folder,
        slug,
        body: src.body,
      },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.find(user, id);
    await this.tenantPrisma.client.inboxSavedReply.delete({ where: { id } });
    return { ok: true };
  }

  async createFolder(user: AuthenticatedUser, name: string) {
    const clean = name.trim();
    if (clean.toLowerCase() === ALL.toLowerCase())
      throw new AppException(
        INBOX_ERROR_CODES.REPLY_SLUG_TAKEN,
        'That folder name is reserved.',
        HttpStatus.BAD_REQUEST,
      );
    await this.tenantPrisma.client.inboxReplyFolder.upsert({
      where: { businessId_name: { businessId: user.businessId, name: clean } },
      create: { businessId: user.businessId, name: clean },
      update: {},
    });
    return { name: clean };
  }

  /** The reply with its `[brackets]` filled from this conversation's real records. */
  async fill(user: AuthenticatedUser, id: string, conversationId: string) {
    const reply = await this.find(user, id);
    const conv = await this.inbox.find(user, conversationId);
    const lastIn = await this.tenantPrisma.client.inboxMessage.findFirst({
      where: { conversationId, kind: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    const f = await this.facts.forConversation(
      user.businessId,
      conv,
      lastIn?.body,
    );
    return {
      id: reply.id,
      ...this.facts.fillPlaceholders(reply.body, f, conv.contactName),
    };
  }
}
