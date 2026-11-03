import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoOffPageService } from './seo-off-page.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoOffPageService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoOffPageService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    businessId = (
      await prisma.business.create({
        data: { name: 'Off Page SEO', slug: `off-page-seo-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new SeoOffPageService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
  });

  afterAll(async () => {
    await prisma.seoOffPageAudit.deleteMany({ where: { businessId } });
    await prisma.seoOffPageOpportunity.deleteMany({ where: { businessId } });
    await prisma.seoOffPageLink.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('stores evidence-backed links and prospects without inventing authority data', async () => {
    const link = await service.createLink(businessId, 'owner-user', {
      sourceUrl: 'https://www.publisher.example/articles/our-shop/#source',
      targetUrl: 'https://shop.example/coffee/',
      anchorText: 'coffee from our shop',
      linkType: 'nofollow',
      evidenceNote: 'Merchant verified the link on the publisher page.',
      relevanceNote: 'The page is about coffee equipment.',
      qualityNote: 'Editorial article with an identified author.',
      riskNote: 'No concern recorded after review.',
    });
    expect(link).toMatchObject({
      sourceDomain: 'www.publisher.example',
      sourceUrl: 'https://www.publisher.example/articles/our-shop',
      targetUrl: 'https://shop.example/coffee',
      sourceName: 'merchant-entered',
      status: 'active',
    });

    await expect(
      service.createLink(businessId, 'owner-user', {
        sourceUrl: 'https://www.publisher.example/articles/our-shop',
        targetUrl: 'https://shop.example/coffee',
        evidenceNote: 'Duplicate observation.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_OFF_PAGE_DUPLICATE_RECORD' },
    });

    const prospect = await service.createOpportunity(businessId, 'owner-user', {
      kind: 'resource',
      title: 'Coffee equipment supplier directory',
      prospectUrl: 'https://directory.example/coffee-suppliers',
      targetUrl: 'https://shop.example/coffee',
      evidenceNote: 'The directory lists independent coffee businesses.',
      relevanceNote: 'The category matches the merchant’s product range.',
      qualityNote: 'Editorial submission criteria are visible on the site.',
    });
    expect(prospect).toMatchObject({
      status: 'open',
      pipeline: 'unassigned',
      kind: 'resource',
    });

    const overview = await service.overview(businessId);
    expect(overview.summary).toMatchObject({
      referringDomains: 1,
      newLinks: 1,
      lostLinks: 0,
      openOpportunities: 1,
      linksWithRiskNotes: 1,
      highValueOpportunities: null,
      authorityTrend: null,
    });
    expect(overview.disclosures.provider).toBe('Not configured');
    expect(overview.links).toHaveLength(1);
    expect(overview.opportunities).toHaveLength(1);
  });

  it('requires reasons for lost/dismissed decisions and audits pipeline and tracking changes', async () => {
    const link = await service.createLink(businessId, 'owner-user', {
      sourceUrl: 'https://news.example/story-about-us',
      targetUrl: 'https://shop.example/',
      evidenceNote: 'Merchant entered this link after checking the page.',
    });
    await expect(
      service.updateLink(businessId, 'owner-user', link.id, { status: 'lost' }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_OFF_PAGE_REASON_REQUIRED' },
    });
    await service.updateLink(businessId, 'owner-user', link.id, {
      status: 'lost',
      reason:
        'The merchant checked the page and the link is no longer present.',
    });
    expect((await service.overview(businessId)).summary.lostLinks).toBe(1);
    await service.updateLink(businessId, 'owner-user', link.id, {
      tracked: false,
    });

    const opportunity = await service.createOpportunity(
      businessId,
      'owner-user',
      {
        kind: 'digital_pr',
        title: 'Local business feature',
        prospectUrl: 'https://journal.example/contact',
        evidenceNote: 'The publication invites local business suggestions.',
        relevanceNote: 'The article series covers independent retailers.',
      },
    );
    await expect(
      service.updateOpportunity(businessId, 'owner-user', opportunity.id, {
        status: 'dismissed',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_OFF_PAGE_REASON_REQUIRED' },
    });
    await service.updateOpportunity(businessId, 'owner-user', opportunity.id, {
      pipeline: 'guest_posting',
      reason: 'Reviewed prospect and routed it to the publication pipeline.',
    });
    await service.updateOpportunity(businessId, 'owner-user', opportunity.id, {
      status: 'dismissed',
      reason: 'The publication no longer accepts pitches.',
    });

    const audits = await prisma.seoOffPageAudit.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual(
      expect.arrayContaining([
        'created',
        'status_lost',
        'untracked',
        'sent_to_guest_posting',
        'dismissed',
      ]),
    );
    expect(audits.every((audit) => audit.actorUserId === 'owner-user')).toBe(
      true,
    );
  });
});
