import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    const [business, schedule, lastRun, keywords, listing] = await Promise.all([
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
    ]);
    const policies = resolvePolicies(business);
    const aiDrafts = policies.bool('seo.aiDraftsEnabled');
    const rankConfigured = Boolean(
      this.config.get<string>('SERPAPI_KEY')?.trim(),
    );
    const siteUrl = lastRun?.siteUrl ?? listing?.website ?? null;

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
        {
          label: 'Google Search Console',
          reason:
            'No connector exists — clicks, impressions and indexing are not tracked.',
        },
        {
          label: 'Analytics',
          reason:
            'No analytics connection — traffic and conversions are not tracked.',
        },
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
