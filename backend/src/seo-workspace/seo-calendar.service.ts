import { HttpStatus, Injectable } from '@nestjs/common';
import { SeoContentBriefStatus } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CONTENT_RULES } from '../marketing/seo-content.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SEO_CALENDAR_ERROR_CODES = {
  NOT_FOUND: 'SEO_CALENDAR_ITEM_NOT_FOUND',
  CLOSED: 'SEO_CALENDAR_ITEM_CLOSED',
  NOT_A_MEMBER: 'SEO_CALENDAR_ASSIGNEE_NOT_MEMBER',
} as const;

const CLOSED: SeoContentBriefStatus[] = [
  SeoContentBriefStatus.published,
  SeoContentBriefStatus.dismissed,
];

export type CalendarUrgency =
  'overdue' | 'due_this_week' | 'later' | 'no_date' | 'done';

/**
 * SEO Content Calendar (SEO Autopilot screen 13). A schedule view over the canonical Content SEO
 * briefs — no second item store and no second workflow: statuses move in Content SEO; here you
 * plan dates and owners. Publish dates come from the recorded published URL and the crawl that
 * confirmed it; refresh-due comes from the same rank-drop rule as the Content refresh queue.
 * There is no Projects & Tasks module, so task linking is not available.
 */
@Injectable()
export class SeoCalendarService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private static urgency(
    status: SeoContentBriefStatus,
    dueAt: Date | null,
    now: Date,
  ): CalendarUrgency {
    if (CLOSED.includes(status)) return 'done';
    if (!dueAt) return 'no_date';
    if (dueAt.getTime() < now.getTime()) return 'overdue';
    if (dueAt.getTime() <= now.getTime() + 7 * DAY_MS) return 'due_this_week';
    return 'later';
  }

  async calendar(businessId: string, now = new Date()) {
    const [briefs, members] = await Promise.all([
      this.db.seoContentBrief.findMany({
        where: { businessId, status: { not: SeoContentBriefStatus.dismissed } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: 500,
        include: {
          keyword: {
            select: {
              keyword: true,
              snapshots: {
                orderBy: { capturedAt: 'desc' },
                take: 1,
                select: { rank: true, capturedAt: true },
              },
            },
          },
        },
      }),
      this.db.businessUser.findMany({
        where: { businessId, active: true },
        select: { userId: true, user: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const names = new Map(members.map((row) => [row.userId, row.user.name]));
    const items = briefs.map((brief) => {
      const latest = brief.keyword?.snapshots[0] ?? null;
      let refreshReason: string | null = null;
      if (
        brief.status === SeoContentBriefStatus.published &&
        brief.baselineRank !== null &&
        latest
      ) {
        if (latest.rank === null) {
          refreshReason = `Was #${brief.baselineRank} when published; not found in the latest rank check.`;
        } else if (
          latest.rank - brief.baselineRank >=
          CONTENT_RULES.refreshDropPositions
        ) {
          refreshReason = `Dropped from #${brief.baselineRank} to #${latest.rank} since publishing.`;
        }
      }
      return {
        id: brief.id,
        title: brief.draftTitle ?? brief.topic,
        topic: brief.topic,
        keyword: brief.keyword?.keyword ?? brief.keywordText,
        keywordId: brief.keywordId,
        format: brief.format,
        status: brief.status,
        assigneeUserId: brief.assigneeUserId,
        assigneeName: brief.assigneeUserId
          ? (names.get(brief.assigneeUserId) ?? 'Former team member')
          : null,
        dueAt: brief.dueAt,
        publishedAt: brief.publishedAt,
        publishedUrl: brief.publishedUrl,
        liveConfirmedAt: brief.liveConfirmedAt,
        urgency: SeoCalendarService.urgency(brief.status, brief.dueAt, now),
        refreshReason,
      };
    });
    const open = items.filter((item) => !CLOSED.includes(item.status));
    return {
      kpis: {
        dueThisWeek: open.filter(
          (item) =>
            item.urgency === 'due_this_week' || item.urgency === 'overdue',
        ).length,
        overdue: open.filter((item) => item.urgency === 'overdue').length,
        briefsReady: open.filter(
          (item) => item.status === SeoContentBriefStatus.brief,
        ).length,
        drafting: open.filter(
          (item) => item.status === SeoContentBriefStatus.drafting,
        ).length,
        awaitingApproval: open.filter(
          (item) => item.status === SeoContentBriefStatus.approval_required,
        ).length,
        /** Approved and given a date — waiting to be published on the merchant's site. */
        scheduled: open.filter(
          (item) =>
            item.status === SeoContentBriefStatus.approved && item.dueAt,
        ).length,
        refreshDue: items.filter((item) => item.refreshReason).length,
        noDate: open.filter((item) => item.urgency === 'no_date').length,
      },
      members: members.map((row) => ({
        userId: row.userId,
        name: row.user.name,
      })),
      items,
    };
  }

  private async findOpen(businessId: string, id: string) {
    const brief = await this.db.seoContentBrief.findFirst({
      where: { id, businessId },
      select: { id: true, status: true, dueAt: true, assigneeUserId: true },
    });
    if (!brief) {
      throw new AppException(
        SEO_CALENDAR_ERROR_CODES.NOT_FOUND,
        'Calendar item was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (CLOSED.includes(brief.status)) {
      throw new AppException(
        SEO_CALENDAR_ERROR_CODES.CLOSED,
        'Published or dismissed content can no longer be rescheduled or reassigned.',
        HttpStatus.CONFLICT,
      );
    }
    return brief;
  }

  async reschedule(
    businessId: string,
    actorUserId: string,
    id: string,
    dueAt: string | null,
  ) {
    const brief = await this.findOpen(businessId, id);
    const next = dueAt ? new Date(dueAt) : null;
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: { dueAt: next },
    });
    await this.db.seoContentBriefAudit.create({
      data: {
        businessId,
        briefId: id,
        action: 'rescheduled',
        actorUserId,
        note: `${brief.dueAt?.toISOString() ?? 'no date'} → ${next?.toISOString() ?? 'no date'}`,
      },
    });
    return updated;
  }

  async assign(
    businessId: string,
    actorUserId: string,
    id: string,
    assigneeUserId: string | null,
  ) {
    await this.findOpen(businessId, id);
    if (assigneeUserId) {
      const member = await this.db.businessUser.findFirst({
        where: { businessId, userId: assigneeUserId, active: true },
        select: { id: true },
      });
      if (!member) {
        throw new AppException(
          SEO_CALENDAR_ERROR_CODES.NOT_A_MEMBER,
          'That person is not an active member of this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: { assigneeUserId },
    });
    await this.db.seoContentBriefAudit.create({
      data: {
        businessId,
        briefId: id,
        action: assigneeUserId ? 'assigned' : 'unassigned',
        actorUserId,
        note: assigneeUserId,
      },
    });
    return updated;
  }
}
