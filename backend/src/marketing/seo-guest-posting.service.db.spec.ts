import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SeoGuestPostingService } from './seo-guest-posting.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoGuestPostingService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoGuestPostingService;
  let businessId: string;
  let aiComplete: jest.Mock;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    businessId = (
      await prisma.business.create({
        data: { name: 'Guest Posting SEO', slug: `guest-posting-seo-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    aiComplete = jest.fn();
    service = new SeoGuestPostingService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { complete: aiComplete } as unknown as AiInfraService,
    );
  });

  afterAll(async () => {
    await prisma.seoGuestPostingAudit.deleteMany({ where: { businessId } });
    await prisma.seoGuestPitch.deleteMany({ where: { businessId } });
    await prisma.seoGuestPublication.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('runs prospect research through approved manual outreach and merchant-verified placement', async () => {
    const publication = await service.createPublication(
      businessId,
      'owner-user',
      {
        name: 'Coffee Journal',
        websiteUrl: 'https://www.coffee-journal.example/contribute/',
        topicNiches: ['coffee', 'small business'],
        market: 'United States',
        relevanceEvidence: 'The editorial site has a coffee equipment section.',
        qualityEvidence:
          'The merchant reviewed its editorial policy and recent articles.',
        guestPolicyUrl: 'https://coffee-journal.example/contribute',
        guestPolicyStatus: 'accepting',
        contactEmail: 'editor@coffee-journal.example',
        contactSource: 'Public editorial contact page.',
      },
    );
    expect(publication).toMatchObject({
      status: 'prospect',
      sourceName: 'merchant_entered',
      websiteUrl: 'https://www.coffee-journal.example/contribute',
    });
    await expect(
      service.createPublication(businessId, 'owner-user', {
        name: 'Duplicate Journal',
        websiteUrl: 'https://coffee-journal.example/',
        topicNiches: ['coffee'],
        relevanceEvidence: 'Duplicate domain.',
        qualityEvidence: 'Duplicate domain.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GUEST_POSTING_DUPLICATE_PUBLICATION' },
    });

    await service.qualifyPublication(
      businessId,
      'owner-user',
      publication.id,
      'qualified',
    );
    aiComplete
      .mockResolvedValueOnce(
        '{"ideas":["How to choose a grinder for a small cafe"]}',
      )
      .mockResolvedValueOnce(
        '{"subject":"Guest article idea for Coffee Journal","body":"Would you consider an article on choosing a grinder for a small cafe? Our notes support this practical topic."}',
      )
      .mockResolvedValueOnce(
        '{"title":"Choosing a Grinder for a Small Cafe","body":"An editable guide based on the merchant source notes."}',
      );
    const [pitch] = await service.generateTopicIdeas(
      businessId,
      'owner-user',
      publication.id,
      'We sell coffee grinders and help independent cafes choose equipment.',
    );
    expect(pitch).toMatchObject({ stage: 'topic_idea', draftSource: 'ai' });

    const pitchDraft = await service.generatePitch(
      businessId,
      'owner-user',
      pitch.id,
    );
    expect(pitchDraft).toMatchObject({
      stage: 'pitch_draft',
      draftSource: 'ai',
    });
    expect(aiComplete).toHaveBeenNthCalledWith(
      2,
      businessId,
      expect.not.stringContaining('editor@coffee-journal.example'),
      0.35,
      'seo_guest_pitch',
    );
    await expect(
      service.submitPitchForApproval(businessId, 'owner-user', pitch.id),
    ).resolves.toMatchObject({ stage: 'approval_required' });
    await expect(
      service.decidePitch(businessId, 'owner-user', pitch.id, 'reject'),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GUEST_POSTING_REASON_REQUIRED' },
    });
    await service.decidePitch(
      businessId,
      'owner-user',
      pitch.id,
      'reject',
      'Narrow the topic to beginner equipment choices.',
    );
    await service.submitPitchForApproval(businessId, 'owner-user', pitch.id);
    await service.decidePitch(businessId, 'owner-user', pitch.id, 'approve');
    await expect(
      service.markOutreachSent(businessId, 'owner-user', pitch.id, ''),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GUEST_POSTING_INVALID_INPUT' },
    });
    await service.markOutreachSent(
      businessId,
      'owner-user',
      pitch.id,
      'Sent from the merchant mailbox after approval.',
    );
    await service.recordResponse(
      businessId,
      'owner-user',
      pitch.id,
      'accepted',
      'The editor accepted the proposed topic by email.',
    );

    const article = await service.generateArticleDraft(
      businessId,
      'owner-user',
      pitch.id,
    );
    expect(article).toMatchObject({
      stage: 'article_draft',
      draftSource: 'ai',
    });
    await service.submitArticleForApproval(businessId, 'owner-user', pitch.id);
    await service.decideArticle(
      businessId,
      'owner-user',
      pitch.id,
      'reject',
      'Add a section about maintenance from the source notes.',
    );
    await service.submitArticleForApproval(businessId, 'owner-user', pitch.id);
    await service.decideArticle(businessId, 'owner-user', pitch.id, 'approve');
    await service.recordPublished(businessId, 'owner-user', pitch.id, {
      publishedUrl: 'https://coffee-journal.example/choosing-a-grinder/',
      placementTargetUrl: 'https://merchant.example/grinders/',
      placementAnchor: 'coffee grinders',
      placementEvidence: 'Merchant reviewed the published placement and link.',
    });
    const verified = await service.verifyPlacement(
      businessId,
      'owner-user',
      pitch.id,
      'I checked the live article and confirmed the linked target.',
    );
    expect(verified).toMatchObject({
      stage: 'verified',
      outreachSendMode: 'manual_external',
      placementAnchor: 'coffee grinders',
    });

    const overview = await service.overview(businessId);
    expect(overview.summary).toMatchObject({
      qualifiedPublications: 1,
      pitchesDrafted: 1,
      waitingApproval: 0,
      responses: 1,
      accepted: 1,
      publishedVerified: 1,
    });
    expect(overview.audits.length).toBeGreaterThan(10);
    expect(overview.disclosures.outreach).toContain('sent outside Noxtill');
    expect(overview.disclosures.placements).toContain('merchant-confirmed');
  });

  it('requires evidence and policy eligibility before qualification and isolates tenant reads', async () => {
    const publication = await service.createPublication(
      businessId,
      'owner-user',
      {
        name: 'Closed Contributions',
        websiteUrl: 'https://closed-publication.example/',
        topicNiches: ['coffee'],
        relevanceEvidence: 'The editorial content relates to coffee.',
        qualityEvidence: 'The merchant reviewed recent posts.',
        guestPolicyStatus: 'not_accepting',
      },
    );
    await expect(
      service.qualifyPublication(
        businessId,
        'owner-user',
        publication.id,
        'qualified',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GUEST_POSTING_INVALID_TRANSITION' },
    });
    await expect(
      service.createTopicIdea(businessId, 'owner-user', publication.id, {
        topicIdea: 'Coffee maintenance',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GUEST_POSTING_INVALID_TRANSITION' },
    });

    const other = await prisma.business.create({
      data: { name: 'Other Guest Posting', slug: `other-guest-${stamp}` },
    });
    try {
      const otherCls = new FakeClsService();
      otherCls.set(CLS_KEY_BUSINESS_ID, other.id);
      const otherTenant = new SeoGuestPostingService(
        new TenantPrismaService(prisma, otherCls as unknown as ClsService),
        { complete: aiComplete } as unknown as AiInfraService,
      );
      await expect(otherTenant.overview(other.id)).resolves.toMatchObject({
        publications: [],
        pitches: [],
      });
    } finally {
      await prisma.business.delete({ where: { id: other.id } });
    }
  });
});
