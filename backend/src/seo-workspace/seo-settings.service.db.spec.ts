import { ClsService } from 'nestjs-cls';
import type { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SeoContentService } from '../marketing/seo-content.service';
import { SeoOnPageService } from '../marketing/seo-on-page.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoSettingsService } from './seo-settings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SEO settings and the rules they control (MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let businessId: string;
  let keywordId: string;
  const complete = jest.fn();
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Settings Co',
          slug: `seo-settings-${stamp}`,
          country: 'US',
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: 'https://settings.test/',
        pages: [
          {
            url: 'https://settings.test/mugs',
            finalUrl: 'https://settings.test/mugs',
            statusCode: 200,
            contentType: 'text/html',
            title: 'Mugs',
            description: null,
            h1Count: 1,
            imagesMissingAlt: 0,
            canonicalUrl: null,
            noindex: false,
          },
        ],
        finishedAt: new Date(),
      },
    });
    keywordId = (
      await prisma.trackedKeyword.create({
        data: {
          businessId,
          keyword: 'blue mugs',
          targetPageUrl: 'https://settings.test/mugs',
        },
      })
    ).id;
    await prisma.keywordRankSnapshot.create({ data: { keywordId, rank: 12 } });
  });

  afterAll(async () => {
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const setPolicies = (policies: Prisma.InputJsonObject) =>
    prisma.business.update({
      where: { id: businessId },
      data: { policies: policies },
    });

  it('summarises setup without exposing credentials', async () => {
    const service = new SeoSettingsService(tenant, {
      get: () => 'secret-key',
    } as unknown as ConfigService);
    const summary = await service.summary(businessId);
    expect(JSON.stringify(summary)).not.toContain('secret-key');
    expect(summary).toMatchObject({
      site: { url: 'https://settings.test/', source: 'site audit' },
      market: { country: 'US' },
      autopilotLevel: 'L1',
      configurationHealth: { ok: 4, of: 5 }, // recurring audit is off
    });
    expect(summary.checks.find((row) => row.key === 'rank_provider')?.ok).toBe(
      true,
    );
  });

  it('applies the thresholds and the AI-drafts switch in the SEO services', async () => {
    const ai = { complete } as unknown as AiInfraService;
    const content = new SeoContentService(tenant, ai);
    const onPage = new SeoOnPageService(tenant, ai);

    // Default: rank 12 is worse than #10 → improve opportunity.
    expect(
      (await content.opportunities(businessId)).opportunities,
    ).toHaveLength(1);
    await setPolicies({ 'seo.improveBelowRank': 20 });
    expect(
      (await content.opportunities(businessId)).opportunities,
    ).toHaveLength(0);
    expect((await content.summary(businessId)).rules.improveBelowRank).toBe(20);

    await setPolicies({ 'seo.aiDraftsEnabled': false });
    await expect(
      onPage.suggest(businessId, 'owner', 'https://settings.test/mugs'),
    ).rejects.toMatchObject({ response: { code: 'SEO_AI_DRAFTS_OFF' } });
    await expect(
      content.generateBrief(businessId, 'owner', keywordId),
    ).rejects.toMatchObject({ response: { code: 'SEO_AI_DRAFTS_OFF' } });
    expect(complete).not.toHaveBeenCalled();
    const summary = await new SeoSettingsService(tenant, {
      get: () => undefined,
    } as unknown as ConfigService).summary(businessId);
    expect(summary.autopilotLevel).toBe('L0');
    expect(summary.checks.find((row) => row.key === 'rank_provider')?.ok).toBe(
      false,
    );
  });
});
