import { ClsService } from 'nestjs-cls';
import { SeoContentBriefStatus } from '@prisma/client';
import type { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoContentService } from './seo-content.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const u = (path: string) => `https://content.test${path}`;
const page = (path: string, statusCode = 200) => ({
  url: u(path),
  finalUrl: u(path),
  statusCode,
  contentType: 'text/html',
  title: path,
  description: null,
  h1Count: 1,
  imagesMissingAlt: 0,
  canonicalUrl: null,
  noindex: false,
});

describe('SeoContentService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoContentService;
  let businessId: string;
  const complete = jest.fn<Promise<string>, unknown[]>();
  const kw: Record<string, string> = {};
  const stamp = Date.now();

  async function crawl(pages: unknown[], finishedAt: Date) {
    await prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: u('/'),
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
    service = new SeoContentService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { complete } as unknown as AiInfraService,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Content Co', slug: `content-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await crawl(
      [page('/'), page('/mugs'), page('/broken', 404)],
      new Date(Date.now() - 60 * 60 * 1000),
    );
    const make = async (
      keyword: string,
      targetPageUrl: string | null,
      rank: number | null | undefined,
    ) => {
      const row = await prisma.trackedKeyword.create({
        data: { businessId, keyword, targetPageUrl, intent: 'informational' },
      });
      if (rank !== undefined) {
        await prisma.keywordRankSnapshot.create({
          data: { keywordId: row.id, rank, searchInterest: 40 },
        });
      }
      kw[keyword] = row.id;
    };
    await make('mug care', null, undefined); // new page
    await make('broken thing', u('/broken'), 3); // missing page
    await make('blue mugs', u('/mugs'), 18); // improve
    await make('home', u('/'), 2); // fine — no opportunity
  });

  afterAll(async () => {
    await prisma.seoContentBriefAudit.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.seoContentDismissal.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('derives opportunities with their evidence, not scores', async () => {
    const { opportunities } = await service.opportunities(businessId);
    const byKeyword = Object.fromEntries(
      opportunities.map((row) => [row.keyword, row]),
    );
    expect(Object.keys(byKeyword).sort()).toEqual([
      'blue mugs',
      'broken thing',
      'mug care',
    ]);
    expect(byKeyword['mug care']).toMatchObject({
      kind: 'new_page',
      coverage: 'none',
      effort: 'high',
    });
    expect(byKeyword['broken thing'].evidence).toMatch(/HTTP 404/);
    expect(byKeyword['blue mugs']).toMatchObject({
      kind: 'improve',
      latestRank: 18,
      searchInterest: 40,
      coverage: 'page',
    });
    expect(await service.summary(businessId)).toMatchObject({
      openOpportunities: 3,
      contentGaps: 1,
      briefsReady: 0,
    });
  });

  it('runs brief → draft → approval → published → live, blocks duplicates, and flags refreshes', async () => {
    complete.mockResolvedValueOnce(
      JSON.stringify({
        topic: 'How to care for ceramic mugs',
        audience: 'Mug owners',
        format: 'guide',
        outline: ['Washing', 'Storage'],
        questions: ['Are mugs dishwasher safe?'],
        internalLinks: [u('/mugs'), 'https://elsewhere.test/x'],
      }),
    );
    const brief = await service.generateBrief(
      businessId,
      'owner',
      kw['mug care'],
    );
    expect(brief).toMatchObject({
      briefSource: 'ai',
      format: 'guide',
      keywordText: 'mug care',
      internalLinks: [u('/mugs')], // external / uncrawled link dropped
    });

    await expect(
      service.createBrief(businessId, 'owner', {
        keywordId: kw['mug care'],
        topic: 'Second take',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CONTENT_DUPLICATE_INTENT' },
    });
    const strategic = await service.createBrief(businessId, 'owner', {
      keywordId: kw['mug care'],
      topic: 'Mug care FAQ',
      strategyNote: 'Separate FAQ page for voice search',
    });
    await service.transition(
      businessId,
      'owner',
      strategic.id,
      SeoContentBriefStatus.dismissed,
      'Merged into the guide',
    );

    await expect(
      service.transition(
        businessId,
        'owner',
        brief.id,
        SeoContentBriefStatus.approval_required,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CONTENT_INVALID_TRANSITION' },
    });
    await service.updateBrief(businessId, 'owner', brief.id, {
      sourceNotes: 'Our mugs are hand-glazed stoneware.',
    });
    complete.mockResolvedValueOnce(
      '```json\n{"title":"Caring for stoneware mugs","body":"# Care\\nHand-glazed stoneware…"}\n```',
    );
    const drafted = await service.generateDraft(businessId, 'owner', brief.id);
    expect(drafted).toMatchObject({ status: 'drafting', draftSource: 'ai' });
    const draftPrompt = complete.mock.calls[1][1] as string;
    expect(draftPrompt).toContain('hand-glazed stoneware');
    expect(draftPrompt).toContain('Never invent');

    await service.transition(
      businessId,
      'owner',
      brief.id,
      SeoContentBriefStatus.approval_required,
    );
    await expect(
      service.transition(
        businessId,
        'owner',
        brief.id,
        SeoContentBriefStatus.drafting,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CONTENT_NOTE_REQUIRED' },
    });
    await service.transition(
      businessId,
      'owner',
      brief.id,
      SeoContentBriefStatus.approved,
    );
    await expect(
      service.transition(
        businessId,
        'owner',
        brief.id,
        SeoContentBriefStatus.published,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CONTENT_INVALID_TRANSITION' },
    });

    // Publish against "blue mugs" style tracking: attach a keyword with a rank baseline.
    await prisma.seoContentBrief.update({
      where: { id: brief.id },
      data: { keywordId: kw['blue mugs'] },
    });
    const published = await service.recordPublished(
      businessId,
      'owner',
      brief.id,
      u('/mug-care'),
    );
    expect(published).toMatchObject({ status: 'published', baselineRank: 18 });

    expect(await service.confirmPublished(businessId)).toEqual({
      checked: 0,
      confirmed: 0,
    });
    await crawl([page('/'), page('/mug-care')], new Date(Date.now() + 1000));
    expect(await service.confirmPublished(businessId)).toEqual({
      checked: 1,
      confirmed: 1,
    });

    await prisma.keywordRankSnapshot.create({
      data: {
        keywordId: kw['blue mugs'],
        rank: 25,
        capturedAt: new Date(Date.now() + 2000),
      },
    });
    const [refresh] = await service.refreshQueue(businessId);
    expect(refresh).toMatchObject({ baselineRank: 18, currentRank: 25 });
    expect(refresh.refreshReason).toMatch(/Dropped from #18 to #25/);
    expect((await service.summary(businessId)).refreshDue).toBe(1);
  });

  it('dismisses an opportunity with a reason and can reopen it', async () => {
    await expect(
      service.dismissOpportunity(
        businessId,
        'owner',
        kw['broken thing'],
        'missing_page',
        ' ',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_CONTENT_NOTE_REQUIRED' },
    });
    await service.dismissOpportunity(
      businessId,
      'owner',
      kw['broken thing'],
      'missing_page',
      'Product discontinued',
    );
    const row = (await service.opportunities(businessId)).opportunities.find(
      (item) => item.keywordId === kw['broken thing'],
    );
    expect(row?.dismissed).toEqual({ reason: 'Product discontinued' });
    await service.reopenOpportunity(
      businessId,
      kw['broken thing'],
      'missing_page',
    );
    const again = (await service.opportunities(businessId)).opportunities.find(
      (item) => item.keywordId === kw['broken thing'],
    );
    expect(again?.dismissed).toBeNull();
  });
});
