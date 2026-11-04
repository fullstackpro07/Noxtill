import { ClsService } from 'nestjs-cls';
import {
  ActionItemType,
  Role,
  SeoContentBriefStatus,
  SeoContentFormat,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcurementService } from '../procurement/procurement.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { SeoContentService } from '../marketing/seo-content.service';
import { ActionCenterService } from './action-center.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('Action Center — SEO Agent content approvals (MySQL)', () => {
  let prisma: PrismaService;
  let service: ActionCenterService;
  let seoContent: SeoContentService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    cls.set(CLS_KEY_BUSINESS_ID, 'initializing');
    seoContent = new SeoContentService(tenant, {} as never);
    service = new ActionCenterService(
      tenant,
      new ProcurementService(
        tenant,
        new PoliciesService(
          prisma,
          cls as unknown as ClsService,
          new CapabilitiesService(prisma),
        ),
      ),
      new StockTransfersService(prisma),
      undefined,
      seoContent,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'SEO Agent Approval QA', slug: `seo-action-${stamp}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'SEO Agent Approval Other Tenant',
          slug: `seo-action-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.seoContentBriefAudit.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.seoContentBrief.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.actionItemState.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  async function makeBrief(
    ownerBusinessId: string,
    source: 'manual' | 'specialist_agent',
  ) {
    const brief = await seoContent.createBrief(
      ownerBusinessId,
      `reviewer-${stamp}`,
      {
        topic: `Approval review ${source} ${stamp}`,
        format: SeoContentFormat.blog_post,
      },
      source,
    );
    return prisma.seoContentBrief.update({
      where: { id: brief.id },
      data: {
        status: SeoContentBriefStatus.approval_required,
        draftTitle: 'QA review title',
        draftBody:
          'A QA-only draft used to verify the real approval lifecycle.',
      },
    });
  }

  it('surfaces only pending specialist drafts and uses the canonical audited approve/send-back transitions', async () => {
    const specialist = await makeBrief(businessId, 'specialist_agent');
    const manual = await makeBrief(businessId, 'manual');

    const listed = await service.list(businessId, Role.owner, null, {
      type: ActionItemType.seo_content_brief,
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: `${ActionItemType.seo_content_brief}:${specialist.id}`,
      approvalAction: 'seo_content_brief',
      deepLink: '/marketing/seo-autopilot/content',
    });
    expect(listed.items[0].reason).toContain('Approval does not publish');
    expect(listed.items.some((item) => item.id.endsWith(manual.id))).toBe(
      false,
    );

    await expect(
      service.dismiss(
        businessId,
        `${ActionItemType.seo_content_brief}:${specialist.id}`,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_AGENT_BRIEF_REQUIRES_DECISION' },
    });

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(
      service.decideSeoAgentContentBriefAction(
        otherBusinessId,
        `reviewer-${stamp}`,
        `${ActionItemType.seo_content_brief}:${specialist.id}`,
        'approve',
        'Reviewed QA draft',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_AGENT_BRIEF_ACTION_NOT_FOUND' },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await service.decideSeoAgentContentBriefAction(
      businessId,
      `reviewer-${stamp}`,
      `${ActionItemType.seo_content_brief}:${specialist.id}`,
      'approve',
      'Approved after reviewing the QA draft',
    );
    const approved = await prisma.seoContentBrief.findUniqueOrThrow({
      where: { id: specialist.id },
    });
    expect(approved.status).toBe(SeoContentBriefStatus.approved);
    expect(approved.publishedUrl).toBeNull();
    expect(approved.decisionNote).toBe('Approved after reviewing the QA draft');
    expect(
      await prisma.seoContentBriefAudit.findFirst({
        where: {
          businessId,
          briefId: specialist.id,
          action: 'status_approved',
          note: 'Approved after reviewing the QA draft',
        },
      }),
    ).not.toBeNull();

    const sendBack = await makeBrief(businessId, 'specialist_agent');
    await service.decideSeoAgentContentBriefAction(
      businessId,
      `reviewer-${stamp}`,
      `${ActionItemType.seo_content_brief}:${sendBack.id}`,
      'send_back',
      'Clarify the source evidence before review',
    );
    const returned = await prisma.seoContentBrief.findUniqueOrThrow({
      where: { id: sendBack.id },
    });
    expect(returned.status).toBe(SeoContentBriefStatus.drafting);
    expect(returned.decisionNote).toBe(
      'Clarify the source evidence before review',
    );
  });
});
