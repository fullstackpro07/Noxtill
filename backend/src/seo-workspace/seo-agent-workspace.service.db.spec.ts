import { ClsService } from 'nestjs-cls';
import {
  SeoContentBriefStatus,
  SeoContentRevisionStatus,
  SeoTechnicalActionStatus,
  SeoTechnicalActionType,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoAgentWorkspaceService } from './seo-agent-workspace.service';

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

describe('SeoAgentWorkspaceService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoAgentWorkspaceService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new SeoAgentWorkspaceService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Workspace Co', slug: `workspace-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const issue = (type: string, firstSeenAt: Date, n: string) => ({
      businessId,
      siteHost: 'ws.test',
      fingerprint: n.repeat(64),
      type,
      severity: 'high',
      pageUrl: 'https://ws.test/',
      evidence: 'seen',
      recommendation: 'fix',
      firstSeenAt,
    });
    await prisma.seoAuditIssue.createMany({
      data: [
        issue('missing_title', new Date(), 'd'),
        issue('missing_h1', new Date(Date.now() - 30 * DAY_MS), 'e'), // too old to be "new"
      ],
    });
    const revision = (
      version: number,
      status: SeoContentRevisionStatus,
      extra: Record<string, unknown> = {},
    ) => ({
      businessId,
      pageUrl: 'https://ws.test/',
      pageKey: 'f'.repeat(64),
      version,
      status,
      beforeSnapshot: {},
      proposedTitle: `Title ${version}`,
      ...extra,
    });
    await prisma.seoContentRevision.createMany({
      data: [
        revision(1, SeoContentRevisionStatus.approval_required, {
          source: 'ai',
        }),
        revision(2, SeoContentRevisionStatus.applied, {
          verification: { pageFound: true, fields: { title: 'mismatch' } },
        }),
        revision(3, SeoContentRevisionStatus.verified, {
          verifiedAt: new Date(),
        }),
        revision(4, SeoContentRevisionStatus.superseded),
      ],
    });
    await prisma.seoTechnicalAction.createMany({
      data: [
        {
          businessId,
          type: SeoTechnicalActionType.robots,
          status: SeoTechnicalActionStatus.applied,
          risk: 'high',
          sourceUrl: 'https://ws.test/robots.txt',
          currentState: {},
          verification: { result: 'not_verifiable' },
        },
        {
          businessId,
          type: SeoTechnicalActionType.redirect,
          status: SeoTechnicalActionStatus.approved,
          risk: 'medium',
          sourceUrl: 'https://ws.test/old',
          targetValue: 'https://ws.test/new',
          currentState: {},
        },
      ],
    });
    await prisma.seoContentBrief.createMany({
      data: [
        {
          businessId,
          topic: 'Draft one',
          outline: [],
          questions: [],
          internalLinks: [],
          status: SeoContentBriefStatus.drafting,
        },
        {
          businessId,
          topic: 'Live one',
          outline: [],
          questions: [],
          internalLinks: [],
          status: SeoContentBriefStatus.published,
          publishedUrl: 'https://ws.test/live',
        },
        {
          businessId,
          topic: 'Just a brief',
          outline: [],
          questions: [],
          internalLinks: [],
          status: SeoContentBriefStatus.brief,
        },
      ],
    });
    await prisma.seoContentBriefAudit.create({
      data: { businessId, briefId: 'x', action: 'status_approved' },
    });
  });

  afterAll(async () => {
    await prisma.seoContentBriefAudit.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.seoTechnicalAction.deleteMany({ where: { businessId } });
    await prisma.seoContentRevision.deleteMany({ where: { businessId } });
    await prisma.seoAuditIssue.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('puts every existing SEO action in one queue by lifecycle stage', async () => {
    const { kpis, items } = await service.queue(businessId);
    expect(kpis).toEqual({
      newFindings: 1,
      draftReady: 1, // the drafting brief (a bare brief is not a draft yet)
      waitingApproval: 1,
      readyToApply: 1, // approved redirect
      verificationRequired: 2, // robots (not verifiable) + published, not yet confirmed
      notMatched: 1, // applied revision whose title didn't match the crawl
      completed: 1,
    });
    const robots = items.find(
      (item) => item.kind === 'technical_change' && item.risk === 'high',
    )!;
    expect(robots.verificationNote).toMatch(/cannot check/);
    const aiDraft = items.find((item) => item.stage === 'waiting_approval')!;
    expect(aiDraft.origin).toMatch(/AI draft/);
    expect(items.some((item) => item.status === 'superseded')).toBe(false);
  });

  it('merges the decision history newest first with an automatic actor label', async () => {
    const history = await service.history(businessId);
    expect(history[0]).toMatchObject({
      kind: 'content',
      action: 'status_approved',
      actor: 'Noxtill (automatic)',
    });
  });
});
