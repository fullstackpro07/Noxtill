import { ClsService } from 'nestjs-cls';
import { Role, SeoContentBriefStatus } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoContentService } from './seo-content.service';
import { KeywordsService } from './keywords.service';
import { SeoLinkBuildingService } from './seo-link-building.service';
import { SeoCompetitorService } from './seo-competitor.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoCompetitorService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoCompetitorService;
  let businessId: string;
  let foreignBusinessId: string;
  let ownerUserId: string;
  let competitorId: string;
  let foreignCompetitorId: string;
  let contentService: SeoContentService;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: { name: 'SEO Competitor Test', slug: `seo-competitor-${stamp}` },
    });
    businessId = business.id;
    const owner = await prisma.user.create({
      data: {
        name: 'SEO Competitor Test Owner',
        email: `seo-competitor-${stamp}@example.test`,
        passwordHash: 'test-hash',
      },
    });
    ownerUserId = owner.id;
    await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: Role.owner },
    });
    const competitor = await prisma.competitor.create({
      data: {
        businessId,
        name: 'Evidence Test Competitor',
        platformRef: `seo-competitor-test-${stamp}`,
      },
    });
    competitorId = competitor.id;
    const foreignBusiness = await prisma.business.create({
      data: {
        name: 'Other SEO Competitor Test',
        slug: `seo-competitor-other-${stamp}`,
      },
    });
    foreignBusinessId = foreignBusiness.id;
    const foreignCompetitor = await prisma.competitor.create({
      data: {
        businessId: foreignBusinessId,
        name: 'Foreign Test Competitor',
        platformRef: `seo-competitor-foreign-${stamp}`,
      },
    });
    foreignCompetitorId = foreignCompetitor.id;

    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const ai = { complete: jest.fn() } as unknown as AiInfraService;
    const keywords = new KeywordsService(
      tenantPrisma,
      {} as never,
      ai,
      {} as never,
    );
    contentService = new SeoContentService(tenantPrisma, ai);
    service = new SeoCompetitorService(
      tenantPrisma,
      keywords,
      contentService,
      new SeoLinkBuildingService(tenantPrisma, ai),
    );
  });

  afterAll(async () => {
    await prisma.seoCompetitorGapAudit.deleteMany({ where: { businessId } });
    await prisma.seoCompetitorGap.deleteMany({ where: { businessId } });
    await prisma.seoContentBriefAudit.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.seoOffPageAudit.deleteMany({ where: { businessId } });
    await prisma.seoOffPageOpportunity.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    if (ownerUserId) await prisma.user.delete({ where: { id: ownerUserId } });
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    if (foreignCompetitorId) {
      await prisma.competitor.delete({ where: { id: foreignCompetitorId } });
    }
    if (foreignBusinessId) {
      await prisma.business.delete({ where: { id: foreignBusinessId } });
    }
    await prisma.$disconnect();
  });

  function evidence(title = `Evidence ${stamp}`) {
    return {
      competitorId,
      kind: 'keyword' as const,
      title,
      keyword: 'manual competitor evidence test keyword',
      intent: 'informational',
      sourceUrl: 'https://source.example/research',
      sourceLabel: 'Observed search result',
      evidenceNote:
        'The source page displayed the named competitor for this query.',
      competitorRank: 4,
    };
  }

  it('uses the latest saved owned rank and discloses the manual evidence source', async () => {
    const empty = await service.overview(businessId);
    expect(empty.trackedCompetitors).toBe(1);
    expect(empty.counts.recordedEvidence).toBe(0);

    const keyword = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'manual competitor evidence test keyword' },
    });
    await prisma.keywordRankSnapshot.create({
      data: { keywordId: keyword.id, rank: 8 },
    });
    const gap = await service.createGap(businessId, ownerUserId, evidence());

    const overview = await service.overview(businessId);
    expect(overview.gaps).toEqual([
      expect.objectContaining({
        id: gap.id,
        competitorRank: 4,
        ownedRank: 8,
        positionComparison: 'competitor_ahead',
        sourceUrl: 'https://source.example/research',
        status: 'open',
      }),
    ]);
    expect(overview.counts.keywordGaps).toBe(1);
    expect(overview.disclosures.keywordData).toContain(
      'not discovered automatically',
    );
    expect(overview.disclosures.backlinkData).toContain('not tracked');
  });

  it('rejects another tenant competitor, invalid evidence and future observations', async () => {
    await expect(
      service.createGap(businessId, ownerUserId, {
        ...evidence(`Foreign competitor ${stamp}`),
        competitorId: foreignCompetitorId,
        sourceUrl: 'https://foreign-source.example/research',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_COMPETITOR_GAP_NOT_FOUND' },
    });
    await expect(
      service.createGap(businessId, ownerUserId, {
        ...evidence(),
        sourceUrl: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_COMPETITOR_INVALID_URL' },
    });
    await expect(
      service.createGap(businessId, ownerUserId, {
        ...evidence(),
        title: `Future evidence ${stamp}`,
        observedAt: new Date(Date.now() + 300_000).toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_COMPETITOR_EVIDENCE_IN_FUTURE' },
    });
  });

  it('deduplicates open evidence and audits reasoned resolve and reopen decisions', async () => {
    const gap = await service.createGap(
      businessId,
      ownerUserId,
      evidence(`Decision evidence ${stamp}`),
    );
    await expect(
      service.createGap(
        businessId,
        ownerUserId,
        evidence(`Decision evidence ${stamp}`),
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_COMPETITOR_DUPLICATE_EVIDENCE' },
    });
    await expect(
      service.transition(businessId, ownerUserId, gap.id, 'resolved', ' '),
    ).rejects.toMatchObject({
      response: { code: 'SEO_COMPETITOR_INVALID_INPUT' },
    });

    await service.transition(
      businessId,
      ownerUserId,
      gap.id,
      'resolved',
      'Reviewed the source and confirmed no action is needed.',
    );
    await service.transition(
      businessId,
      ownerUserId,
      gap.id,
      'open',
      'New source evidence warrants another review.',
    );
    const overview = await service.overview(businessId);
    const record = overview.gaps.find((item) => item.id === gap.id);
    expect(record?.status).toBe('open');
    expect(record?.audits.map((event) => event.action)).toEqual([
      'reopened',
      'resolved',
      'evidence_recorded',
    ]);
    expect(record?.audits[0]?.reason).toBe(
      'New source evidence warrants another review.',
    );
  });

  it('creates a tracked keyword action and records its audit event', async () => {
    const gap = await service.createGap(
      businessId,
      ownerUserId,
      evidence(`Action evidence ${stamp}`),
    );
    const action = await service.createAction(
      businessId,
      ownerUserId,
      gap.id,
      'keyword',
    );
    expect(action).toMatchObject({
      id: gap.id,
      actionType: 'keyword',
      actionUrl: '/marketing/seo-autopilot/keywords',
      status: 'actioned',
    });
    expect(
      await prisma.trackedKeyword.findFirst({
        where: {
          businessId,
          keyword: 'manual competitor evidence test keyword',
        },
      }),
    ).not.toBeNull();
    const updated = await prisma.seoCompetitorGap.findUnique({
      where: { id: gap.id },
    });
    expect(updated).toMatchObject({
      status: 'actioned',
      actionType: 'keyword',
      actionEntityId: action.actionEntityId,
    });
    const audit = await prisma.seoCompetitorGapAudit.findFirst({
      where: { businessId, gapId: gap.id, action: 'action_created_keyword' },
    });
    expect(audit?.actorUserId).toBe(ownerUserId);
  });

  it('routes content-gap actions through the canonical brief approval workflow', async () => {
    const gap = await service.createGap(businessId, ownerUserId, {
      ...evidence(`Content action evidence ${stamp}`),
      kind: 'content',
    });
    const action = await service.createAction(
      businessId,
      ownerUserId,
      gap.id,
      'content',
    );

    const brief = await prisma.seoContentBrief.findFirst({
      where: { id: action.actionEntityId, businessId },
    });
    expect(brief).toMatchObject({
      topic: gap.title,
      status: SeoContentBriefStatus.brief,
      briefSource: 'manual',
    });
    if (!brief) throw new Error('Expected the canonical content brief.');

    await contentService.updateBrief(businessId, ownerUserId, brief.id, {
      draftTitle: gap.title,
      draftBody: 'A short, evidence-based draft for review.',
    });
    await contentService.transition(
      businessId,
      ownerUserId,
      brief.id,
      SeoContentBriefStatus.approval_required,
    );
    await contentService.transition(
      businessId,
      ownerUserId,
      brief.id,
      SeoContentBriefStatus.approved,
      'Reviewed against the merchant-recorded competitor evidence.',
    );

    const approved = await prisma.seoContentBrief.findFirst({
      where: { id: brief.id, businessId },
    });
    expect(approved?.status).toBe(SeoContentBriefStatus.approved);
    expect(
      await prisma.seoCompetitorGapAudit.findFirst({
        where: {
          businessId,
          gapId: gap.id,
          action: 'action_created_content',
          actorUserId: ownerUserId,
        },
      }),
    ).not.toBeNull();
  });
});
