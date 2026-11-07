import { ClsService } from 'nestjs-cls';
import { SeoContentBriefStatus } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoCalendarService } from './seo-calendar.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SeoCalendarService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoCalendarService;
  let businessId: string;
  let memberUserId: string;
  let outsiderUserId: string;
  const ids: Record<string, string> = {};
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new SeoCalendarService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Calendar Co', slug: `calendar-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    memberUserId = (
      await prisma.user.create({
        data: { name: 'Writer Wen', passwordHash: 'x' },
      })
    ).id;
    outsiderUserId = (
      await prisma.user.create({
        data: { name: 'Outsider', passwordHash: 'x' },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId: memberUserId },
    });
    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'mug care' },
    });
    await prisma.keywordRankSnapshot.create({
      data: { keywordId: keyword.id, rank: 20 },
    });
    const now = Date.now();
    const make = async (
      key: string,
      status: SeoContentBriefStatus,
      extra: Record<string, unknown> = {},
    ) => {
      ids[key] = (
        await prisma.seoContentBrief.create({
          data: {
            businessId,
            topic: key,
            outline: [],
            questions: [],
            internalLinks: [],
            status,
            ...extra,
          },
        })
      ).id;
    };
    await make('overdue', SeoContentBriefStatus.drafting, {
      dueAt: new Date(now - 2 * DAY_MS),
    });
    await make('soon', SeoContentBriefStatus.brief, {
      dueAt: new Date(now + 3 * DAY_MS),
    });
    await make('scheduled', SeoContentBriefStatus.approved, {
      dueAt: new Date(now + 20 * DAY_MS),
    });
    await make('undated', SeoContentBriefStatus.approval_required);
    await make('published', SeoContentBriefStatus.published, {
      keywordId: keyword.id,
      baselineRank: 8,
      publishedAt: new Date(now - 30 * DAY_MS),
    });
    await make('gone', SeoContentBriefStatus.dismissed);
  });

  afterAll(async () => {
    await prisma.seoContentBriefAudit.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberUserId, outsiderUserId] } },
    });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('builds the schedule from canonical briefs with urgency and refresh due', async () => {
    const result = await service.calendar(businessId);
    expect(result.items.map((item) => item.topic)).not.toContain('gone');
    const byTopic = Object.fromEntries(
      result.items.map((item) => [item.topic, item]),
    );
    expect(byTopic.overdue.urgency).toBe('overdue');
    expect(byTopic.soon.urgency).toBe('due_this_week');
    expect(byTopic.undated.urgency).toBe('no_date');
    expect(byTopic.published.urgency).toBe('done');
    expect(byTopic.published.refreshReason).toMatch(/#8 to #20/);
    expect(result.kpis).toMatchObject({
      dueThisWeek: 2,
      overdue: 1,
      briefsReady: 1,
      drafting: 1,
      awaitingApproval: 1,
      scheduled: 1,
      refreshDue: 1,
      noDate: 1,
    });
    expect(result.members).toEqual([
      { userId: memberUserId, name: 'Writer Wen' },
    ]);
  });

  it('reschedules and assigns only open items and only to team members, with audit', async () => {
    const when = new Date(Date.now() + 10 * DAY_MS).toISOString();
    await service.reschedule(businessId, 'owner', ids.overdue, when);
    await service.assign(businessId, 'owner', ids.overdue, memberUserId);
    await expect(
      service.assign(businessId, 'owner', ids.overdue, outsiderUserId),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CALENDAR_ASSIGNEE_NOT_MEMBER' },
    });
    await expect(
      service.reschedule(businessId, 'owner', ids.published, when),
    ).rejects.toMatchObject({ response: { code: 'SEO_CALENDAR_ITEM_CLOSED' } });

    const item = (await service.calendar(businessId)).items.find(
      (row) => row.id === ids.overdue,
    )!;
    expect(item).toMatchObject({
      urgency: 'later',
      assigneeName: 'Writer Wen',
    });
    const audits = await prisma.seoContentBriefAudit.findMany({
      where: { businessId, briefId: ids.overdue },
    });
    expect(audits.map((row) => row.action).sort()).toEqual([
      'assigned',
      'rescheduled',
    ]);
  });
});
