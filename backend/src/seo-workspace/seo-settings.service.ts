import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export interface SeoConfigCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  href: string;
}

/**
 * SEO Settings (SEO Autopilot screen 16) — the read side: which site, markets and data sources SEO
 * Autopilot is actually working with. Editable rules live in Settings → SEO Autopilot (policies with
 * history and reset); this never returns credentials, only whether one is configured.
 */
@Injectable()
export class SeoSettingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  async summary(businessId: string) {
    const db = this.tenantPrisma.client;
    const [
      business,
      schedule,
      lastRun,
      keywords,
      listing,
      analyticsIntegration,
    ] = await Promise.all([
      db.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { country: true, locale: true, policies: true },
      }),
      db.seoAuditSchedule.findUnique({
        where: { businessId },
        select: { enabled: true, intervalHours: true, nextRunAt: true },
      }),
      db.seoAuditRun.findFirst({
        where: { businessId },
        orderBy: { startedAt: 'desc' },
        select: { siteUrl: true, status: true, finishedAt: true },
      }),
      db.trackedKeyword.count({ where: { businessId } }),
      db.masterListing.findUnique({
        where: { businessId },
        select: { website: true },
      }),
      db.integration.findUnique({
        where: {
          businessId_provider: {
            businessId,
            provider: IntegrationProvider.google_analytics,
          },
        },
        select: { status: true, meta: true },
      }),
    ]);
    const policies = resolvePolicies(business);
    const aiDrafts = policies.bool('seo.aiDraftsEnabled');
    const rankConfigured = Boolean(
      this.config.get<string>('SERPAPI_KEY')?.trim(),
    );
    const siteUrl = lastRun?.siteUrl ?? listing?.website ?? null;
    const analyticsMeta =
      analyticsIntegration?.meta &&
      typeof analyticsIntegration.meta === 'object' &&
      !Array.isArray(analyticsIntegration.meta)
        ? (analyticsIntegration.meta as Record<string, unknown>)
        : {};
    const analyticsSelected =
      typeof analyticsMeta.analyticsSelectedProperty === 'string';
    const analyticsSnapshot = analyticsMeta.analyticsOrganicSearchSnapshot;
    const analyticsSnapshotRecord =
      typeof analyticsSnapshot === 'object' &&
      analyticsSnapshot !== null &&
      !Array.isArray(analyticsSnapshot)
        ? (analyticsSnapshot as Record<string, unknown>)
        : {};
    const analyticsCurrent = analyticsSnapshotRecord.current;
    const analyticsCurrentRecord =
      typeof analyticsCurrent === 'object' &&
      analyticsCurrent !== null &&
      !Array.isArray(analyticsCurrent)
        ? (analyticsCurrent as Record<string, unknown>)
        : {};
    const analyticsLandingPages = analyticsCurrentRecord.landingPages;
    const analyticsLandingPagesRecord =
      typeof analyticsLandingPages === 'object' &&
      analyticsLandingPages !== null &&
      !Array.isArray(analyticsLandingPages)
        ? (analyticsLandingPages as Record<string, unknown>)
        : {};
    const analyticsSynced = Boolean(analyticsSnapshot);
    const analyticsLandingPagesSynced = [
      'returned',
      'no_data_returned',
    ].includes(String(analyticsLandingPagesRecord.dataState));
    const analyticsUnavailableReason =
      analyticsIntegration?.status !== IntegrationStatus.connected
        ? 'Connect Google Analytics 4 in Integrations to sync Organic Search totals and page-path metrics.'
        : !analyticsSelected
          ? 'Select a Google Analytics 4 property in SEO Settings to sync Organic Search totals and page-path metrics.'
          : !analyticsSynced
            ? 'Google Analytics 4 is connected, but no Organic Search snapshot has been synced yet.'
            : !analyticsLandingPagesSynced
              ? 'A saved Google Analytics snapshot is missing page-path metrics. Sync again in SEO Settings.'
              : null;

    const checks: SeoConfigCheck[] = [
      {
        key: 'site',
        label: 'Website audited',
        ok: Boolean(lastRun && lastRun.status !== 'failed'),
        detail: lastRun
          ? `${lastRun.siteUrl} · last audit ${lastRun.status}`
          : 'No site audit has run yet.',
        href: '/marketing/seo-autopilot',
      },
      {
        key: 'schedule',
        label: 'Recurring site audit',
        ok: Boolean(schedule?.enabled),
        detail: schedule?.enabled
          ? `Every ${schedule.intervalHours} hours`
          : 'Off — audits run only when started by hand.',
        href: '/marketing/seo-autopilot',
      },
      {
        key: 'keywords',
        label: 'Keywords tracked',
        ok: keywords > 0,
        detail:
          keywords > 0 ? `${keywords} keyword(s)` : 'No keywords tracked yet.',
        href: '/marketing/seo-autopilot/keywords',
      },
      {
        key: 'rank_provider',
        label: 'Rank checks (SerpApi)',
        ok: rankConfigured,
        detail: rankConfigured
          ? 'Configured on the server.'
          : 'Not configured — rank checks cannot run.',
        href: '/marketing/seo-autopilot/rank-tracking',
      },
      {
        key: 'market',
        label: 'Business country',
        ok: Boolean(business.country),
        detail: business.country ?? 'Not set — set it in Settings → General.',
        href: '/settings/general',
      },
    ];

    return {
      site: {
        url: siteUrl,
        source: lastRun
          ? 'site audit'
          : listing?.website
            ? 'business listing'
            : null,
      },
      market: { country: business.country, locale: business.locale },
      autopilotLevel: aiDrafts ? 'L1' : 'L0',
      aiDraftsEnabled: aiDrafts,
      approvalPolicy: 'Every change needs approval and is applied by you',
      checks,
      configurationHealth: {
        ok: checks.filter((check) => check.ok).length,
        of: checks.length,
      },
      notConnected: [
        ...(analyticsUnavailableReason
          ? [
              {
                label: 'Google Analytics 4',
                reason: analyticsUnavailableReason,
              },
            ]
          : []),
        {
          label: 'Backlink index',
          reason: 'No backlink provider — links are recorded by your team.',
        },
        {
          label: 'Outreach sending',
          reason:
            'Noxtill does not send outreach; your team sends it and records the result.',
        },
      ],
    };
  }
}
