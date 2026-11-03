import { ClsService } from 'nestjs-cls';
import {
  SeoTechnicalActionStatus,
  SeoTechnicalActionType,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoTechnicalService } from './seo-technical.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const SITE = 'https://tech.test/';
const u = (path: string) => `https://tech.test${path}`;

function page(path: string, fields: Record<string, unknown> = {}) {
  return {
    url: u(path),
    finalUrl: u(path),
    statusCode: 200,
    contentType: 'text/html',
    title: path,
    description: null,
    h1Count: 1,
    imagesMissingAlt: 0,
    canonicalUrl: null,
    noindex: false,
    ...fields,
  };
}

describe('SeoTechnicalService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoTechnicalService;
  let businessId: string;
  const stamp = Date.now();

  async function crawl(pages: unknown[], finishedAt: Date) {
    await prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: SITE,
        pages: pages as object[],
        startedAt: finishedAt,
        finishedAt,
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new SeoTechnicalService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Tech SEO', slug: `tech-seo-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await crawl(
      [
        page('/', { inSitemap: true }),
        page('/old', { inSitemap: false }),
        page('/moved', { finalUrl: u('/landing'), inSitemap: true }),
        page('/gone', { statusCode: 404 }),
        page('/hidden', { noindex: true, inSitemap: false }),
        page('/dup', { canonicalUrl: u('/') }),
      ],
      new Date(Date.now() - 60 * 60 * 1000),
    );
    await prisma.seoAuditIssue.createMany({
      data: [
        {
          businessId,
          siteHost: 'tech.test',
          fingerprint: 'b'.repeat(64),
          type: 'broken_internal_link',
          severity: 'high',
          pageUrl: u('/gone'),
          evidence: 'Linked from /',
          recommendation: 'Fix the link.',
        },
        {
          businessId,
          siteHost: 'tech.test',
          fingerprint: 'c'.repeat(64),
          type: 'missing_title',
          severity: 'medium',
          pageUrl: u('/old'),
          evidence: 'On-page, not technical.',
          recommendation: 'Add a title.',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.seoTechnicalActionAudit.deleteMany({ where: { businessId } });
    await prisma.seoTechnicalAction.deleteMany({ where: { businessId } });
    await prisma.seoAuditIssue.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('derives technical KPIs and lists only technical issues', async () => {
    const overview = await service.overview(businessId);
    expect(overview.kpis).toMatchObject({
      criticalIssues: 1,
      indexablePages: 4, // /, /old, /moved, /dup — not /gone (404) or /hidden (noindex)
      sitemapCoverage: { inSitemap: 2, of: 3 }, // /dup has no sitemap data
      brokenLinks: 1,
      canonicalConflicts: 1,
      redirectedPages: 1,
    });
    expect(overview.issues.map((issue) => issue.type)).toEqual([
      'broken_internal_link',
    ]);
    expect(overview.issues[0].group).toBe('broken_links');
  });

  it('validates redirects for loops, broken targets and chains', async () => {
    const redirect = (sourcePath: string, target: string) =>
      service.validate(businessId, {
        type: SeoTechnicalActionType.redirect,
        sourceUrl: u(sourcePath),
        targetValue: target,
      });
    expect((await redirect('/old', u('/old/'))).problems[0]).toMatch(/itself/);
    expect((await redirect('/old', u('/gone'))).problems[0]).toMatch(/404/);
    expect((await redirect('/old', u('/moved'))).warnings.join(' ')).toMatch(
      /redirect chain/,
    );
    expect((await redirect('/old', 'not a url')).ok).toBe(false);
  });

  it('gates approval on validation and verifies applied changes by crawl', async () => {
    const forward = await service.create(businessId, 'owner', {
      type: SeoTechnicalActionType.redirect,
      sourceUrl: u('/old'),
      targetValue: u('/new'),
    });
    expect(forward).toMatchObject({ risk: 'medium', status: 'draft' });
    expect(forward.currentState).toMatchObject({
      crawled: true,
      statusCode: 200,
    });

    const back = await service.create(businessId, 'owner', {
      type: SeoTechnicalActionType.redirect,
      sourceUrl: u('/new'),
      targetValue: u('/old'),
    });
    expect(back.validation).toMatchObject({ ok: false });
    await expect(
      service.transition(
        businessId,
        'owner',
        back.id,
        SeoTechnicalActionStatus.approval_required,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_TECHNICAL_VALIDATION_FAILED' },
    });

    // While the looping draft exists, the forward redirect is blocked too; cancel the bad one.
    await service.transition(
      businessId,
      'owner',
      back.id,
      SeoTechnicalActionStatus.cancelled,
    );

    const robots = await service.create(businessId, 'owner', {
      type: SeoTechnicalActionType.robots,
      sourceUrl: u('/robots.txt'),
      description: 'Disallow: /cart',
    });
    expect(robots.risk).toBe('high');

    for (const action of [forward, robots]) {
      for (const status of [
        SeoTechnicalActionStatus.approval_required,
        SeoTechnicalActionStatus.approved,
        SeoTechnicalActionStatus.applied,
      ]) {
        await service.transition(businessId, 'owner', action.id, status);
      }
    }
    await expect(
      service.transition(
        businessId,
        'owner',
        forward.id,
        SeoTechnicalActionStatus.verified,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_TECHNICAL_INVALID_TRANSITION' },
    });

    // Nothing is checked against a crawl older than the "applied" time.
    expect(await service.verifyApplied(businessId)).toEqual({
      checked: 0,
      verified: 0,
    });

    await crawl(
      [page('/'), page('/old', { finalUrl: u('/new') }), page('/new')],
      new Date(Date.now() + 1000),
    );
    expect(await service.verifyApplied(businessId)).toEqual({
      checked: 2,
      verified: 1,
    });
    const [verified, unverifiable] = await Promise.all([
      prisma.seoTechnicalAction.findUniqueOrThrow({
        where: { id: forward.id },
      }),
      prisma.seoTechnicalAction.findUniqueOrThrow({ where: { id: robots.id } }),
    ]);
    expect(verified.status).toBe(SeoTechnicalActionStatus.verified);
    expect(unverifiable.status).toBe(SeoTechnicalActionStatus.applied);
    expect(unverifiable.verification).toMatchObject({
      result: 'not_verifiable',
    });
  });
});
