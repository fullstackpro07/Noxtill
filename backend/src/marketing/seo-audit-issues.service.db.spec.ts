import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoAuditIssuesService } from './seo-audit-issues.service';
import type { SeoAuditIssue, SeoAuditPage } from './seo-site-audit.util';

jest.setTimeout(60_000);

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoAuditIssuesService (MySQL lifecycle)', () => {
  let prisma: PrismaService;
  let service: SeoAuditIssuesService;
  let businessId: string;
  let otherBusinessId: string;
  const testBusinessIds: string[] = [];
  const cls = new FakeClsService();
  const owner: AuthenticatedUser = {
    sub: 'seo-issue-test-user',
    businessId: '',
    role: 'owner',
    capabilities: [],
  };

  const homepage: SeoAuditPage = {
    url: 'https://www.example.test/',
    finalUrl: 'https://www.example.test/',
    statusCode: 200,
    contentType: 'text/html',
    title: null,
    description: 'A description',
    h1Count: 1,
    imagesMissingAlt: 0,
    canonicalUrl: 'https://www.example.test/',
    noindex: false,
  };
  const missingTitle: SeoAuditIssue = {
    type: 'missing_title',
    severity: 'high',
    url: 'https://example.test/?campaign=private',
    evidence: 'No title was found.',
    recommendation: 'Add a page title.',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SeoAuditIssuesService(tenantPrisma);
    const suffix = Date.now().toString();
    const business = await prisma.business.create({
      data: { name: 'SEO Issue Test', slug: `seo-issue-${suffix}` },
    });
    const otherBusiness = await prisma.business.create({
      data: { name: 'SEO Issue Other Test', slug: `seo-issue-other-${suffix}` },
    });
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    testBusinessIds.push(business.id, otherBusiness.id);
    owner.businessId = businessId;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(async () => {
    await prisma.seoAuditIssueAudit.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.seoAuditIssue.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.seoAuditRun.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
  });

  afterAll(async () => {
    if (testBusinessIds.length > 0) {
      await prisma.seoAuditIssueAudit.deleteMany({
        where: { businessId: { in: testBusinessIds } },
      });
      await prisma.seoAuditIssue.deleteMany({
        where: { businessId: { in: testBusinessIds } },
      });
      await prisma.seoAuditRun.deleteMany({
        where: { businessId: { in: testBusinessIds } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: testBusinessIds } },
      });
    }
    await prisma.$disconnect();
  });

  async function createRun(forBusiness = businessId) {
    return prisma.seoAuditRun.create({
      data: {
        businessId: forBusiness,
        siteUrl: 'https://example.test/',
        status: 'completed',
      },
    });
  }

  it('deduplicates findings and resolves only on a successful recrawl of the same page', async () => {
    const initialRun = await createRun();
    const initialSync = await service.syncFromAudit({
      businessId,
      auditRunId: initialRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [
        homepage,
        {
          ...homepage,
          url: 'https://example.test/contact',
          finalUrl: 'https://example.test/contact',
        },
      ],
      issues: [
        missingTitle,
        {
          ...missingTitle,
          severity: 'low',
          evidence: 'Duplicate copy of the finding.',
        },
        {
          ...missingTitle,
          type: 'missing_h1',
          severity: 'medium',
          url: 'https://example.test/contact',
        },
      ],
    });
    expect(initialSync.newlyDetectedHighPriorityCount).toBe(1);

    const firstIssues = await service.list(businessId);
    expect(firstIssues).toHaveLength(2);
    expect(
      firstIssues.find((row) => row.type === 'missing_title')?.severity,
    ).toBe('high');

    const repeatedRun = await createRun();
    const repeatedSync = await service.syncFromAudit({
      businessId,
      auditRunId: repeatedRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [missingTitle],
    });
    expect(repeatedSync.newlyDetectedHighPriorityCount).toBe(0);

    const nextRun = await createRun();
    await service.syncFromAudit({
      businessId,
      auditRunId: nextRun.id,
      siteUrl: 'https://example.test/',
      status: 'partial',
      pages: [homepage],
      issues: [],
    });

    const open = await service.list(businessId);
    expect(open).toHaveLength(1);
    expect(open[0].type).toBe('missing_h1');
    const resolved = await service.list(businessId, 'resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('missing_title');
    expect(resolved[0].auditEvents.map((event) => event.action)).toContain(
      'resolved_by_audit',
    );
  });

  it('requires ignore reasons and preserves ignored issues until a person reopens them', async () => {
    const initialRun = await createRun();
    await service.syncFromAudit({
      businessId,
      auditRunId: initialRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [missingTitle],
    });
    const [issue] = await service.list(businessId);
    await expect(service.ignore(owner, issue.id, '  ')).rejects.toThrow(
      'Enter a reason between 3 and 1000 characters.',
    );

    const ignored = await service.ignore(
      owner,
      issue.id,
      'Intentional for launch',
    );
    expect(ignored.status).toBe('ignored');
    expect(ignored.ignoreReason).toBe('Intentional for launch');

    const repeatedRun = await createRun();
    const repeatedSync = await service.syncFromAudit({
      businessId,
      auditRunId: repeatedRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [
        { ...missingTitle, evidence: 'Still present on the latest crawl.' },
      ],
    });
    expect(repeatedSync.newlyDetectedHighPriorityCount).toBe(0);
    expect(await service.list(businessId, 'ignored')).toHaveLength(1);

    const reopened = await service.reopen(
      owner,
      issue.id,
      'We are fixing this now',
    );
    expect(reopened.status).toBe('open');
    expect(reopened.ignoreReason).toBeNull();
    const [current] = await service.list(businessId);
    expect(current.auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining(['ignored', 'reopened_by_user']),
    );
  });

  it('reopens a verified-resolved finding if a later crawl detects it again', async () => {
    const firstRun = await createRun();
    const initialSync = await service.syncFromAudit({
      businessId,
      auditRunId: firstRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [missingTitle],
    });
    expect(initialSync.newlyDetectedHighPriorityCount).toBe(1);
    const [issue] = await service.list(businessId);

    const cleanRun = await createRun();
    await service.syncFromAudit({
      businessId,
      auditRunId: cleanRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [{ ...homepage, title: 'Now titled' }],
      issues: [],
    });
    expect(await service.list(businessId, 'resolved')).toHaveLength(1);

    const recurrenceRun = await createRun();
    const recurrenceSync = await service.syncFromAudit({
      businessId,
      auditRunId: recurrenceRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [missingTitle],
    });
    expect(recurrenceSync.newlyDetectedHighPriorityCount).toBe(1);
    const [reopened] = await service.list(businessId);
    expect(reopened.id).toBe(issue.id);
    expect(reopened.auditEvents.map((event) => event.action)).toContain(
      'reopened',
    );
  });

  it('does not close duplicate-title findings from a bounded partial crawl', async () => {
    const initialRun = await createRun();
    await service.syncFromAudit({
      businessId,
      auditRunId: initialRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [{ ...missingTitle, type: 'duplicate_title' }],
    });
    const cleanRun = await createRun();
    await service.syncFromAudit({
      businessId,
      auditRunId: cleanRun.id,
      siteUrl: 'https://example.test/',
      status: 'partial',
      pages: [homepage],
      issues: [],
    });
    expect(await service.list(businessId)).toHaveLength(1);
  });

  it('keeps issue lists tenant scoped', async () => {
    const otherRun = await createRun(otherBusinessId);
    const otherTenantService = new SeoAuditIssuesService(
      new TenantPrismaService(prisma, {
        get: () => otherBusinessId,
      } as unknown as ClsService),
    );
    await otherTenantService.syncFromAudit({
      businessId: otherBusinessId,
      auditRunId: otherRun.id,
      siteUrl: 'https://example.test/',
      status: 'completed',
      pages: [homepage],
      issues: [missingTitle],
    });
    expect(await service.list(businessId)).toHaveLength(0);
    expect(await otherTenantService.list(otherBusinessId)).toHaveLength(1);
  });
});
