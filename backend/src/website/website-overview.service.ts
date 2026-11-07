import { Injectable } from '@nestjs/common';
import {
  WebsiteDomainStatus,
  WebsitePageKind,
  WebsitePageStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { hasPlaceholder } from './website-builder.service';
import { blockReferences, themeContrastChecks } from './website-content.util';
import { WebsiteService, pagePath } from './website.service';

export interface SiteIssue {
  key: string;
  severity: 'high' | 'medium' | 'low';
  issue: string;
  page: string | null;
  detected: string;
  impact: string;
  sourceModule: string;
  href: string;
}

/**
 * Website Overview: publishing health, recent changes and scoped snapshots. Every figure is
 * counted from canonical records; traffic is shown as not tracked because no analytics source is
 * connected to the owned site.
 */
@Injectable()
export class WebsiteOverviewService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly website: WebsiteService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async overview(businessId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const site = await this.website.site(businessId);
    const business = await this.website.businessSummary(businessId);
    const live = await this.website.liveSnapshot(site);
    const [
      pages,
      deployments,
      pending,
      forms,
      submissions,
      storefrontOrders,
      domains,
      seoOpen,
      storeOpen,
      recentAudit,
      scheduleFailures,
    ] = await Promise.all([
      this.db.websitePage.findMany({
        where: { siteId: site.id },
        select: {
          id: true,
          title: true,
          slug: true,
          kind: true,
          status: true,
          blocks: true,
          metaDescription: true,
          version: true,
          publishedVersion: true,
          updatedAt: true,
        },
      }),
      this.website.listDeployments(businessId),
      this.website.pendingChanges(businessId),
      this.db.websiteForm.findMany({
        where: { siteId: site.id },
        select: { id: true, name: true },
      }),
      this.db.websiteFormSubmission.groupBy({
        by: ['status'],
        where: { businessId, isTest: false, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.db.order.aggregate({
        where: {
          businessId,
          publicIdempotencyKeyHash: { not: null },
          isQuotation: false,
          createdAt: { gte: since },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.db.websiteDomain.findMany({ where: { siteId: site.id } }),
      this.db.seoAuditIssue.count({ where: { businessId, status: 'open' } }),
      this.db.commerceStoreOpportunity.count({
        where: { businessId, status: { in: ['open', 'in_progress'] } },
      }),
      this.db.auditLog.findMany({
        where: { businessId, action: { startsWith: 'website.' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
        select: {
          action: true,
          createdAt: true,
          actorUserId: true,
          after: true,
        },
      }),
      this.db.auditLog.findMany({
        where: {
          businessId,
          action: 'website.scheduled_publish.failed',
          createdAt: { gte: since },
        },
        select: { entityId: true, createdAt: true },
      }),
    ]);

    const settings = live?.settings;
    const livePaths = new Set<string>(['/', '/blog', '/search']);
    for (const p of live?.pages ?? [])
      livePaths.add(pagePath(p.kind, p.slug, settings?.homePageId, p.id));
    const issues: SiteIssue[] = [];
    const pageHref = (id: string, kind: WebsitePageKind) =>
      kind === 'post'
        ? `/website/blog?page=${id}`
        : kind === 'landing'
          ? `/website/landing-pages?page=${id}`
          : `/website/pages?page=${id}`;

    for (const p of live?.pages ?? []) {
      if (hasPlaceholder(p.blocks)) {
        issues.push({
          key: `placeholder-${p.id}`,
          severity: 'high',
          issue: 'Live page still contains [placeholder] text',
          page: p.title,
          detected: p.publishedAt,
          impact: 'Visitors see unfinished copy',
          sourceModule: 'Website',
          href: pageHref(p.id, p.kind),
        });
      }
      if (!p.metaDescription && !p.excerpt) {
        issues.push({
          key: `meta-${p.id}`,
          severity: 'low',
          issue: 'No meta description',
          page: p.title,
          detected: p.publishedAt,
          impact: 'Search results show auto-picked text',
          sourceModule: 'SEO Autopilot',
          href: '/marketing/seo-autopilot/on-page',
        });
      }
      for (const link of blockReferences(p.blocks).internalLinks) {
        if (
          !livePaths.has(link) &&
          !link.startsWith('/store') &&
          !link.startsWith('/book') &&
          !link.startsWith('/portal')
        ) {
          issues.push({
            key: `link-${p.id}-${link}`,
            severity: 'medium',
            issue: `Button links to ${link}, which is not a live page`,
            page: p.title,
            detected: p.publishedAt,
            impact: 'Visitors reach a not-found page',
            sourceModule: 'Website',
            href: pageHref(p.id, p.kind),
          });
        }
      }
    }
    for (const p of pages.filter(
      (pg) =>
        pg.status === WebsitePageStatus.published &&
        pg.publishedVersion !== pg.version,
    )) {
      issues.push({
        key: `pending-${p.id}`,
        severity: 'low',
        issue: 'Saved edits are not published yet',
        page: p.title,
        detected: p.updatedAt.toISOString(),
        impact: 'Live page shows the earlier version',
        sourceModule: 'Website',
        href: pageHref(p.id, p.kind),
      });
    }
    if (live) {
      for (const check of themeContrastChecks(live.theme).filter(
        (c) => !c.passes,
      )) {
        issues.push({
          key: `contrast-${check.key}`,
          severity: 'medium',
          issue: `Low contrast: ${check.label} (${check.ratio}:1, needs ${check.minimum}:1)`,
          page: null,
          detected: deployments[0]?.createdAt.toISOString() ?? '',
          impact: 'Harder to read; fails WCAG AA',
          sourceModule: 'Website',
          href: '/website/themes',
        });
      }
    }
    for (const d of domains) {
      if (d.status === WebsiteDomainStatus.failed) {
        issues.push({
          key: `domain-${d.id}`,
          severity: 'medium',
          issue: `Domain ${d.hostname} failed verification`,
          page: null,
          detected: (d.lastCheckedAt ?? d.createdAt).toISOString(),
          impact: d.lastError ?? 'DNS record missing',
          sourceModule: 'Website',
          href: '/website/domains',
        });
      }
      if (d.sslError) {
        issues.push({
          key: `ssl-${d.id}`,
          severity: 'high',
          issue: `SSL problem on ${d.hostname}`,
          page: null,
          detected: (d.sslCheckedAt ?? d.createdAt).toISOString(),
          impact: d.sslError,
          sourceModule: 'Website',
          href: '/website/domains',
        });
      }
    }
    for (const f of scheduleFailures) {
      const page = pages.find((p) => p.id === f.entityId);
      issues.push({
        key: `sched-${f.entityId}-${f.createdAt.getTime()}`,
        severity: 'high',
        issue: 'Scheduled publish failed',
        page: page?.title ?? null,
        detected: f.createdAt.toISOString(),
        impact: 'Page did not go live; it was moved back to draft',
        sourceModule: 'Website',
        href: page ? pageHref(page.id, page.kind) : '/website/pages',
      });
    }
    const failedSubmissions =
      submissions.find((s) => s.status === 'failed')?._count._all ?? 0;
    if (failedSubmissions) {
      issues.push({
        key: 'form-failures',
        severity: 'high',
        issue: `${failedSubmissions} form submission(s) failed to save`,
        page: null,
        detected: since.toISOString(),
        impact: 'Leads may have been lost',
        sourceModule: 'Website',
        href: '/website/forms',
      });
    }
    const order = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);

    const count = (status: string) =>
      submissions.find((s) => s.status === status)?._count._all ?? 0;
    const lastDeployment = deployments[0] ?? null;
    return {
      periodDays: days,
      business: {
        name: business.name,
        slug: business.slug,
        currency: business.currency,
      },
      siteStatus: !live
        ? 'not_published'
        : site.maintenanceMode
          ? 'maintenance'
          : 'live',
      hostedPath: `/site/${business.slug}`,
      lastPublish: lastDeployment
        ? {
            number: lastDeployment.number,
            at: lastDeployment.createdAt,
            summary: lastDeployment.summary,
            by: lastDeployment.actorName,
          }
        : null,
      pending,
      kpis: {
        sessions: {
          value: null,
          availability: 'not_tracked',
          detail: 'No web analytics source is connected to the owned site.',
        },
        conversion: {
          value: null,
          availability: 'not_tracked',
          detail: 'Needs session data, which is not tracked.',
        },
        formLeads: {
          value: count('accepted'),
          spamBlocked: count('spam_blocked'),
          failed: failedSubmissions,
          source: 'Website form submissions → CRM customers',
        },
        storefrontOrders: {
          value: storefrontOrders._count._all,
          total: Number(storefrontOrders._sum.total ?? 0),
          source: 'Orders placed through the /store checkout',
        },
        livePages: {
          value: live?.pages.length ?? 0,
          drafts: pages.filter((p) => p.status === WebsitePageStatus.draft)
            .length,
          scheduled: pages.filter(
            (p) => p.status === WebsitePageStatus.scheduled,
          ).length,
        },
        openIssues: issues.length,
      },
      funnel: {
        formsLive: forms.filter((f) =>
          live?.pages.some((p) =>
            p.blocks.some((b) => b.type === 'form' && b.formId === f.id),
          ),
        ).length,
        leads: count('accepted'),
        orders: storefrontOrders._count._all,
      },
      topPages: (live?.pages ?? []).slice(0, 8).map((p) => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        path: pagePath(p.kind, p.slug, settings?.homePageId, p.id),
        publishedAt: p.publishedAt,
        views: null,
      })),
      issues,
      recentChanges: recentAudit.map((a) => ({
        action: a.action,
        at: a.createdAt,
        after: a.after,
      })),
      handoffs: {
        seo: { openIssues: seoOpen, href: '/marketing/seo-autopilot' },
        storeOptimizer: {
          openOpportunities: storeOpen,
          href: '/autonomous-commerce/store-optimizer',
        },
      },
    };
  }
}
