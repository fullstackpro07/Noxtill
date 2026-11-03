import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoLinkBuildingService } from './seo-link-building.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoLinkBuildingService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoLinkBuildingService;
  let businessId: string;
  let ownerUserId: string;
  let aiComplete: jest.Mock;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: { name: 'Link Building SEO', slug: `link-building-seo-${stamp}` },
    });
    businessId = business.id;
    const owner = await prisma.user.create({
      data: {
        name: 'SEO Test Owner',
        email: `seo-link-building-${stamp}@example.test`,
        passwordHash: 'test-hash',
      },
    });
    ownerUserId = owner.id;
    await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: Role.owner },
    });
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    aiComplete = jest.fn();
    service = new SeoLinkBuildingService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { complete: aiComplete } as unknown as AiInfraService,
    );
  });

  afterAll(async () => {
    await prisma.seoOffPageAudit.deleteMany({ where: { businessId } });
    await prisma.seoOffPageOpportunity.deleteMany({ where: { businessId } });
    await prisma.seoOffPageLink.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    if (ownerUserId) await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('requires evidence, approval, an external-send confirmation, and merchant-verified link evidence', async () => {
    const opportunity = await service.createOpportunity(
      businessId,
      ownerUserId,
      {
        kind: 'resource',
        title: 'Coffee resource page',
        prospectUrl: 'https://publisher.example/resources/coffee/',
        targetUrl: 'https://merchant.example/guides/coffee/',
        evidenceNote: 'The page lists independently sourced coffee guides.',
        relevanceNote:
          'The listed resources cover coffee equipment and brewing.',
        qualityNote: 'Editorial page reviewed by the owner; links are curated.',
        riskNote: 'No link scheme or paid-placement language was observed.',
        contactEmail: 'editor@publisher.example',
        contactSource: 'Public editorial contact page.',
      },
    );
    expect(opportunity).toMatchObject({
      pipeline: 'link_building',
      stage: 'identified',
      ownerUserId,
      prospectUrl: 'https://publisher.example/resources/coffee',
    });

    const overview = await service.overview(businessId);
    expect(overview.summary.openOpportunities).toBe(1);
    expect(overview.summary.won).toBe(0);
    expect(overview.targetPages).toEqual([]);
    expect(overview.disclosures.discovery).toContain(
      'no backlink discovery provider',
    );

    await service.qualify(businessId, ownerUserId, opportunity.id);
    aiComplete.mockResolvedValueOnce(
      JSON.stringify({
        angle: 'Suggest one genuinely relevant guide for the editor to review.',
        draft:
          'Would this coffee guide be useful for your curated resource page?',
        targetUrl: 'https://merchant.example/guides/coffee',
      }),
    );
    const drafted = await service.draftWithAi(
      businessId,
      ownerUserId,
      opportunity.id,
    );
    expect(drafted.stage).toBe('drafted');
    expect(typeof drafted.outreachAngle).toBe('string');
    expect(aiComplete).toHaveBeenCalledWith(
      businessId,
      expect.not.stringContaining('editor@publisher.example'),
      0.35,
      'seo_link_building_outreach',
    );

    await service.submitForApproval(businessId, ownerUserId, opportunity.id);
    await expect(
      service.decideApproval(businessId, ownerUserId, opportunity.id, false),
    ).rejects.toMatchObject({
      response: { code: 'SEO_LINK_BUILDING_REASON_REQUIRED' },
    });
    await service.decideApproval(
      businessId,
      ownerUserId,
      opportunity.id,
      false,
      'Add a direct explanation for why this is relevant.',
    );
    await service.submitForApproval(businessId, ownerUserId, opportunity.id);
    await service.decideApproval(businessId, ownerUserId, opportunity.id, true);
    await service.markSent(businessId, ownerUserId, opportunity.id);
    await service.recordResponse(businessId, ownerUserId, opportunity.id, {
      disposition: 'accepted',
      responseNote: 'The editor agreed to review this resource for the page.',
    });

    const won = await service.markWon(businessId, ownerUserId, opportunity.id, {
      sourceUrl: 'https://publisher.example/resources/coffee/merchant-guide',
      targetUrl: 'https://merchant.example/guides/coffee',
      anchorText: 'coffee guide',
      linkType: 'nofollow',
      evidenceNote:
        'Owner checked the published page and saw the link to the target.',
    });
    expect(won.opportunity).toMatchObject({
      stage: 'won',
      wonLinkId: won.link.id,
    });
    expect(won.link).toMatchObject({
      status: 'active',
      sourceName: 'merchant-entered',
      sourceDomain: 'publisher.example',
    });
    const finishedOverview = await service.overview(businessId);
    expect(finishedOverview.summary).toMatchObject({
      openOpportunities: 0,
      qualified: 1,
      contacted: 1,
      responses: 1,
      won: 1,
    });
    expect(finishedOverview.audits.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps lost-link evidence and makes recovery an audited merchant-confirmed action', async () => {
    const link = await prisma.seoOffPageLink.create({
      data: {
        businessId,
        relationshipKey: `lost-${stamp}`.padEnd(64, '0').slice(0, 64),
        sourceDomain: 'publisher.example',
        sourceUrl: 'https://publisher.example/article',
        targetUrl: 'https://merchant.example/guides/coffee',
        status: 'lost',
        evidenceNote: 'Owner previously saw the link but it was later removed.',
        sourceName: 'merchant-entered',
        createdByUserId: ownerUserId,
      },
    });
    expect((await service.overview(businessId)).summary.lostLinkAlerts).toBe(1);
    await expect(
      service.recoverLink(businessId, ownerUserId, link.id, '   '),
    ).rejects.toMatchObject({
      response: { code: 'SEO_LINK_BUILDING_INVALID_INPUT' },
    });
    const recovered = await service.recoverLink(
      businessId,
      ownerUserId,
      link.id,
      'Owner reopened the page and confirmed the target link is visible again.',
    );
    expect(recovered).toMatchObject({
      status: 'active',
      sourceName: 'merchant-entered',
    });
    expect(recovered.lastSeenAt).toBeInstanceOf(Date);
    const audit = await prisma.seoOffPageAudit.findFirst({
      where: { businessId, entityType: 'link', entityId: link.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toMatchObject({
      action: 'status_recovered_merchant_verified',
      reason:
        'Owner reopened the page and confirmed the target link is visible again.',
    });
  });

  it('limits target suggestions to same-site crawl pages and allows response disposition updates', async () => {
    const audit = await prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: 'https://merchant.example',
        pages: [
          {
            url: 'https://merchant.example/guides/coffee',
            statusCode: 200,
            title: 'Coffee guide',
          },
          {
            url: 'https://merchant.example/redirected-guide',
            canonicalUrl: 'https://other.example/unrelated',
            statusCode: 200,
            title: 'Redirected guide',
          },
        ],
      },
    });
    try {
      const overview = await service.overview(businessId);
      expect(overview.targetPages).toEqual([
        {
          url: 'https://merchant.example/guides/coffee',
          title: 'Coffee guide',
        },
      ]);

      const input = {
        kind: 'broken_link' as const,
        title: 'Broken coffee resource',
        prospectUrl: 'https://publisher.example/coffee-resources',
        evidenceNote: 'The resource page has a dead link to a coffee guide.',
        relevanceNote: 'The resource page is about coffee education.',
        qualityNote:
          'The editorial page and surrounding content were reviewed.',
        riskNote: 'No paid-link or exchange terms were observed.',
        contactSource: 'Public editorial form.',
      };
      await expect(
        service.createOpportunity(businessId, ownerUserId, {
          ...input,
          targetUrl: 'https://other.example/unrelated',
        }),
      ).rejects.toMatchObject({
        response: { code: 'SEO_LINK_BUILDING_TARGET_PAGE_REQUIRED' },
      });

      const opportunity = await service.createOpportunity(
        businessId,
        ownerUserId,
        { ...input, targetUrl: overview.targetPages[0].url },
      );
      await service.qualify(businessId, ownerUserId, opportunity.id);
      await service.saveDraft(businessId, ownerUserId, opportunity.id, {
        outreachAngle: 'Offer a relevant replacement resource.',
        outreachDraft: 'Would this independently researched guide be useful?',
      });
      await service.submitForApproval(businessId, ownerUserId, opportunity.id);
      await service.decideApproval(
        businessId,
        ownerUserId,
        opportunity.id,
        true,
      );
      await service.markSent(businessId, ownerUserId, opportunity.id);
      const firstReply = await service.recordResponse(
        businessId,
        ownerUserId,
        opportunity.id,
        {
          disposition: 'other',
          responseNote: 'The editor asked for more details before deciding.',
        },
      );
      expect(firstReply.stage).toBe('response_received');
      const updatedReply = await service.recordResponse(
        businessId,
        ownerUserId,
        opportunity.id,
        {
          disposition: 'accepted',
          responseNote: 'The editor confirmed they will add the resource.',
        },
      );
      expect(updatedReply.stage).toBe('accepted');
      expect(updatedReply.responseNote).toContain('confirmed');
    } finally {
      await prisma.seoAuditRun.delete({ where: { id: audit.id } });
    }
  });

  it('rejects duplicate prospect pipelines and isolates cross-business reads', async () => {
    const input = {
      kind: 'competitor' as const,
      title: 'Competitor resource gap',
      prospectUrl: 'https://competitor.example/partners',
      targetUrl: 'https://merchant.example/solutions',
      evidenceNote:
        'The competitor page lists resources related to the merchant service.',
      relevanceNote: 'The topic matches the business site content.',
      qualityNote: 'A human reviewed the page and its publication context.',
      riskNote: 'No clear risk noted during manual review.',
    };
    const created = await service.createOpportunity(
      businessId,
      ownerUserId,
      input,
    );
    await expect(
      service.createOpportunity(businessId, ownerUserId, input),
    ).rejects.toMatchObject({
      response: { code: 'SEO_LINK_BUILDING_DUPLICATE_RECORD' },
    });

    const other = await prisma.business.create({
      data: {
        name: 'Other Link Building',
        slug: `other-link-building-${stamp}`,
      },
    });
    try {
      const otherCls = new FakeClsService();
      otherCls.set(CLS_KEY_BUSINESS_ID, other.id);
      const otherService = new SeoLinkBuildingService(
        new TenantPrismaService(prisma, otherCls as unknown as ClsService),
        { complete: aiComplete } as unknown as AiInfraService,
      );
      await expect(otherService.overview(other.id)).resolves.toMatchObject({
        opportunities: [],
        lostLinks: [],
      });
      await expect(
        otherService.markLost(
          other.id,
          ownerUserId,
          created.id,
          'wrong tenant',
        ),
      ).rejects.toMatchObject({
        response: { code: 'SEO_LINK_BUILDING_RECORD_NOT_FOUND' },
      });
    } finally {
      await prisma.business.delete({ where: { id: other.id } });
    }
  });
});
