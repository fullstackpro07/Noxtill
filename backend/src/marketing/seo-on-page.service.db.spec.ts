import { ClsService } from 'nestjs-cls';
import { SeoContentRevisionStatus } from '@prisma/client';
import type { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoOnPageService } from './seo-on-page.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const PAGE_A = 'https://shop.test/mugs';
const PAGE_B = 'https://shop.test/about';

function page(url: string, fields: Record<string, unknown>) {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    title: null,
    description: null,
    h1Count: 1,
    h1: null,
    imagesMissingAlt: 0,
    canonicalUrl: null,
    noindex: false,
    ...fields,
  };
}

describe('SeoOnPageService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoOnPageService;
  let businessId: string;
  const complete = jest.fn();
  const stamp = Date.now();

  async function crawl(pages: unknown[], finishedAt: Date) {
    return prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: 'https://shop.test/',
        pagesCrawled: pages.length,
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
    service = new SeoOnPageService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { complete } as unknown as AiInfraService,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'On Page Co', slug: `on-page-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await crawl(
      [
        page(PAGE_A, { title: 'Mugs', h1: 'Our mugs' }),
        page(PAGE_B, { title: 'About us', description: 'Who we are' }),
        { ...page('https://shop.test/missing', {}), statusCode: 404 },
      ],
      new Date(Date.now() - 60 * 60 * 1000),
    );
    await prisma.seoAuditIssue.create({
      data: {
        businessId,
        siteHost: 'shop.test',
        fingerprint: 'a'.repeat(64),
        type: 'missing_meta_description',
        severity: 'medium',
        pageUrl: `${PAGE_A}/`,
        evidence: 'No meta description.',
        recommendation: 'Add one.',
      },
    });
    await prisma.trackedKeyword.createMany({
      data: [
        { businessId, keyword: 'blue mugs', targetPageUrl: PAGE_A },
        { businessId, keyword: 'gift ideas' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.seoContentRevisionAudit.deleteMany({ where: { businessId } });
    await prisma.seoContentRevision.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.seoAuditIssue.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists crawled HTML pages with their real issues, keyword and summary', async () => {
    const { pages } = await service.pages(businessId);
    expect(pages.map((row) => row.url)).toEqual([PAGE_A, PAGE_B]);
    expect(pages[0]).toMatchObject({
      primaryKeyword: 'blue mugs',
      issues: ['missing_meta_description'],
      health: 'needs_work',
      h1: 'Our mugs',
    });
    expect(pages[1]).toMatchObject({ health: 'ok', primaryKeyword: null });
    expect(await service.summary(businessId)).toMatchObject({
      pagesCrawled: 2,
      pagesNeedingWork: 1,
      metadataIssues: 1,
      contentGaps: 1,
      approvedRevisions: 0,
    });
  });

  it('versions proposals, needs approval, and only a later crawl can verify', async () => {
    await expect(
      service.create(businessId, 'owner', { pageUrl: PAGE_A }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_ON_PAGE_EMPTY_PROPOSAL' },
    });
    await expect(
      service.create(businessId, 'owner', {
        pageUrl: 'https://shop.test/never-crawled',
        proposedTitle: 'x',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_ON_PAGE_PAGE_NOT_CRAWLED' },
    });

    const v1 = await service.create(businessId, 'owner', {
      pageUrl: PAGE_A,
      proposedTitle: 'Blue mugs  | On Page Co',
    });
    expect(v1).toMatchObject({
      version: 1,
      proposedTitle: 'Blue mugs | On Page Co',
    });
    const v2 = await service.create(businessId, 'owner', {
      pageUrl: `${PAGE_A}/`,
      proposedTitle: 'Blue ceramic mugs | On Page Co',
      proposedMetaDescription: 'Handmade blue mugs.',
    });
    expect(v2.version).toBe(2);
    expect(
      (
        await prisma.seoContentRevision.findUniqueOrThrow({
          where: { id: v1.id },
        })
      ).status,
    ).toBe(SeoContentRevisionStatus.superseded);
    expect(v2.beforeSnapshot).toMatchObject({ title: 'Mugs', h1: 'Our mugs' });

    await expect(
      service.transition(
        businessId,
        'owner',
        v2.id,
        SeoContentRevisionStatus.approved,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_ON_PAGE_INVALID_TRANSITION' },
    });
    await service.transition(
      businessId,
      'owner',
      v2.id,
      SeoContentRevisionStatus.approval_required,
    );
    await expect(
      service.transition(
        businessId,
        'owner',
        v2.id,
        SeoContentRevisionStatus.rejected,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_ON_PAGE_NOTE_REQUIRED' },
    });
    await service.transition(
      businessId,
      'owner',
      v2.id,
      SeoContentRevisionStatus.approved,
    );
    await expect(
      service.transition(
        businessId,
        'owner',
        v2.id,
        SeoContentRevisionStatus.verified,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_ON_PAGE_INVALID_TRANSITION' },
    });
    await service.transition(
      businessId,
      'owner',
      v2.id,
      SeoContentRevisionStatus.applied,
    );

    // The latest crawl predates "applied", so it proves nothing yet.
    expect(await service.verifyApplied(businessId)).toEqual({
      checked: 0,
      verified: 0,
    });

    // A later crawl shows the title live but the old (missing) description: not verified.
    await crawl(
      [
        page(PAGE_A, {
          title: 'Blue ceramic mugs | On Page Co',
          h1: 'Our mugs',
        }),
        page(PAGE_B, { title: 'About us', description: 'Who we are' }),
      ],
      new Date(Date.now() + 1000),
    );
    expect(await service.verifyApplied(businessId)).toEqual({
      checked: 1,
      verified: 0,
    });
    const pending = await prisma.seoContentRevision.findUniqueOrThrow({
      where: { id: v2.id },
    });
    expect(pending.status).toBe(SeoContentRevisionStatus.applied);
    expect(pending.verification).toMatchObject({
      fields: { title: 'match', metaDescription: 'mismatch' },
    });

    await crawl(
      [
        page(PAGE_A, {
          title: 'Blue ceramic mugs | On Page Co',
          description: 'Handmade  blue mugs.',
        }),
        page(PAGE_B, { title: 'About us', description: 'Who we are' }),
      ],
      new Date(Date.now() + 2000),
    );
    expect(await service.verifyApplied(businessId)).toEqual({
      checked: 1,
      verified: 1,
    });
    expect(
      (
        await prisma.seoContentRevision.findUniqueOrThrow({
          where: { id: v2.id },
        })
      ).status,
    ).toBe(SeoContentRevisionStatus.verified);

    const restored = await service.restore(businessId, 'owner', v1.id);
    expect(restored).toMatchObject({
      version: 3,
      source: 'restore',
      proposedTitle: 'Blue mugs | On Page Co',
      status: SeoContentRevisionStatus.draft,
    });
    const actions = await prisma.seoContentRevisionAudit.findMany({
      where: { businessId, revisionId: v2.id },
    });
    expect(actions.map((row) => row.action).sort()).toEqual([
      'created_manual',
      'status_applied',
      'status_approval_required',
      'status_approved',
      'verified_by_crawl',
    ]);
  });

  it('turns an AI suggestion into an editable draft, never applying it', async () => {
    complete.mockResolvedValueOnce(
      '```json\n{"title":"About On Page Co","metaDescription":"Who we are.","h1":"About us","rationale":"Adds brand name."}\n```',
    );
    const draft = await service.suggest(businessId, 'owner', PAGE_B);
    expect(draft).toMatchObject({
      source: 'ai',
      status: SeoContentRevisionStatus.draft,
      proposedTitle: 'About On Page Co',
      proposedH1: 'About us',
    });
    const prompt = complete.mock.calls[0][1] as string;
    expect(prompt).toContain('Do not invent');
    expect(prompt).toContain('About us');

    const edited = await service.editDraft(businessId, 'owner', draft.id, {
      proposedTitle: 'About us | On Page Co',
    });
    expect(edited.proposedTitle).toBe('About us | On Page Co');
  });
});
