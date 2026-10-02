import { ClsService } from 'nestjs-cls';
import {
  SeoContentBriefStatus,
  SeoContentRevisionStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoReportsService } from './seo-reports.service';

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
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('SeoReportsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoReportsService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new SeoReportsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Reports Co', slug: `seo-reports-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const rising = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'rising' },
    });
    const falling = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'falling' },
    });
    await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'never checked' },
    });
    await prisma.keywordRankSnapshot.createMany({
      data: [
        { keywordId: rising.id, rank: 14, capturedAt: ago(40) },
        { keywordId: rising.id, rank: 2, capturedAt: ago(5) },
        { keywordId: falling.id, rank: 8, capturedAt: ago(35) },
        { keywordId: falling.id, rank: null, capturedAt: ago(3) },
      ],
    });
    const run = (finishedAt: Date, issues: { severity: string }[]) => ({
      businessId,
      status: 'completed',
      siteUrl: 'https://reports.test/',
      issuesFound: issues.length,
      issues,
      startedAt: finishedAt,
      finishedAt,
    });
    await prisma.seoAuditRun.createMany({
      data: [
        run(ago(45), [
          { severity: 'high' },
          { severity: 'high' },
          { severity: 'low' },
        ]),
        run(ago(2), [{ severity: 'low' }]),
      ],
    });
    await prisma.seoContentRevision.create({
      data: {
        businessId,
        pageUrl: 'https://reports.test/',
        pageKey: 'a'.repeat(64),
        version: 1,
        status: SeoContentRevisionStatus.verified,
        beforeSnapshot: {},
        proposedTitle: 'x',
        verifiedAt: ago(1),
      },
    });
    await prisma.seoContentBrief.create({
      data: {
        businessId,
        topic: 'Published',
        outline: [],
        questions: [],
        internalLinks: [],
        status: SeoContentBriefStatus.published,
        publishedAt: ago(10),
        liveConfirmedAt: ago(9),
      },
    });
    await prisma.externalReview.createMany({
      data: [
        {
          businessId,
          platform: 'google',
          externalId: `a${stamp}`,
          stars: 5,
          createdAt: ago(3),
        },
        {
          businessId,
          platform: 'google',
          externalId: `b${stamp}`,
          stars: 4,
          createdAt: ago(4),
        },
        {
          businessId,
          platform: 'google',
          externalId: `c${stamp}`,
          stars: 2,
          createdAt: ago(50),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.seoContentRevision.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('compares the period with the previous one using only recorded data', async () => {
    const report = await service.report(businessId, 30);
    const metric = (key: string) =>
      report.metrics.find((row) => row.key === key)!;
    expect(metric('keywords_top10')).toMatchObject({ baseline: 1, current: 1 });
    expect(metric('keywords_top3')).toMatchObject({ baseline: 0, current: 1 });
    expect(metric('audit_issues')).toMatchObject({ baseline: 3, current: 1 });
    expect(metric('audit_high_issues')).toMatchObject({
      baseline: 2,
      current: 0,
    });
    expect(metric('content_published')).toMatchObject({
      baseline: 0,
      current: 1,
    });
    expect(metric('reviews_count')).toMatchObject({ baseline: 1, current: 2 });
    expect(metric('reviews_average')).toMatchObject({
      baseline: 2,
      current: 4.5,
    });
    expect(metric('actions_completed')).toMatchObject({
      baseline: 0,
      current: 2,
    });
    expect(metric('links_recorded')).toMatchObject({ baseline: 0, current: 0 });
    expect(report.rankDistribution.current).toEqual({
      top3: 1,
      top10: 0,
      top20: 0,
      beyond20: 0,
      notFound: 1,
      unchecked: 1,
    });
    expect(
      report.keywords.find((row) => row.keyword === 'falling'),
    ).toMatchObject({
      baseline: 8,
      current: null,
      currentChecked: true,
    });
    expect(report.notTracked.map((row) => row.label)).toContain(
      'Organic clicks and impressions',
    );
  });

  it('falls back to 30 days for an unsupported period', async () => {
    expect((await service.report(businessId, 12)).period.days).toBe(30);
  });
});
