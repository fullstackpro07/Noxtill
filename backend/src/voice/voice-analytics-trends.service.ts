import { Injectable } from '@nestjs/common';
import { PhoneCallStatus, VoiceQualityReviewStatus } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { localParts } from './voice-insights.service';

const WINDOWS = [7, 30, 90] as const;

interface DayRow {
  day: string;
  calls: number;
  missed: number;
  transferred: number;
  aiContained: number;
  humanConnected: number;
  aiOnlyMinutes: number;
  humanInvolvedMinutes: number;
  pricedCalls: number;
  pricedCost: number;
  qualityReviews: number;
  qualityScoreSum: number;
  eligibilityChecks: number;
  eligibilityBlocked: number;
}

/** Plain-language definitions shown with the charts; they describe the computation below. */
export const VOICE_METRIC_GLOSSARY = [
  {
    metric: 'Calls',
    definition:
      'Saved inbound calls that started on the day (business time zone).',
  },
  {
    metric: 'Missed',
    definition:
      'Calls whose provider status ended as no-answer, busy, failed or cancelled before anyone handled them.',
  },
  {
    metric: 'Transferred',
    definition:
      'Calls whose saved status is transferred (the provider confirmed the transfer leg).',
  },
  {
    metric: 'AI contained',
    definition:
      'Finished calls that were not missed, not transferred, had no human agent connected and no staff member joined.',
  },
  {
    metric: 'Human connected',
    definition:
      'Calls where a dispatched human agent leg was provider-confirmed connected, or a staff member joined live.',
  },
  {
    metric: 'AI-only minutes',
    definition: 'Start-to-end duration of finished AI-contained calls.',
  },
  {
    metric: 'Human-involved minutes',
    definition:
      'Start-to-end duration of finished calls with a human connected. Includes the AI portion before the handoff; separate leg timing is not stored.',
  },
  {
    metric: 'Cost per priced call',
    definition:
      'Sum of provider-reported prices divided by the number of calls the provider has priced. Unpriced calls are excluded, never estimated.',
  },
  {
    metric: 'Average quality score',
    definition:
      'Mean of submitted quality reviews (override score when a reviewer overrode it) for calls started that day.',
  },
  {
    metric: 'Compliance blocked rate',
    definition:
      'Outbound eligibility checks that refused a call, divided by all checks run that day.',
  },
];

/**
 * Call Analytics trends: one row per day computed from stored call, review and eligibility facts.
 * Data lag is whatever the provider callbacks have delivered so far; nothing is projected.
 */
@Injectable()
export class VoiceAnalyticsTrendsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async trends(businessId: string, requestedDays?: string) {
    const parsed = Number(requestedDays);
    const days = (WINDOWS as readonly number[]).includes(parsed) ? parsed : 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const tz = business.timezone || 'UTC';

    const [calls, reviews, decisions] = await Promise.all([
      this.tenantPrisma.client.phoneCall.findMany({
        where: { businessId, startedAt: { gte: since }, isTestCall: false },
        select: {
          status: true,
          startedAt: true,
          endedAt: true,
          joinedAt: true,
          providerCost: true,
          providerCostCheckedAt: true,
          _count: {
            select: {
              humanAgentAssignments: { where: { status: 'connected' } },
            },
          },
        },
      }),
      this.tenantPrisma.client.voiceQualityReview.findMany({
        where: {
          businessId,
          status: VoiceQualityReviewStatus.submitted,
          call: { startedAt: { gte: since } },
        },
        select: {
          computedScore: true,
          overrideScore: true,
          call: { select: { startedAt: true } },
        },
      }),
      this.tenantPrisma.client.voiceOutboundEligibilityDecision.findMany({
        where: { businessId, evaluatedAt: { gte: since } },
        select: { allowed: true, evaluatedAt: true },
      }),
    ]);

    const rows = new Map<string, DayRow>();
    const row = (date: Date) => {
      const day = localParts(date, tz).day;
      let entry = rows.get(day);
      if (!entry) {
        entry = {
          day,
          calls: 0,
          missed: 0,
          transferred: 0,
          aiContained: 0,
          humanConnected: 0,
          aiOnlyMinutes: 0,
          humanInvolvedMinutes: 0,
          pricedCalls: 0,
          pricedCost: 0,
          qualityReviews: 0,
          qualityScoreSum: 0,
          eligibilityChecks: 0,
          eligibilityBlocked: 0,
        };
        rows.set(day, entry);
      }
      return entry;
    };

    for (const call of calls) {
      const r = row(call.startedAt);
      r.calls += 1;
      const human = call._count.humanAgentAssignments > 0 || !!call.joinedAt;
      const minutes = call.endedAt
        ? Math.max(0, call.endedAt.getTime() - call.startedAt.getTime()) /
          60_000
        : 0;
      if (call.status === PhoneCallStatus.missed) r.missed += 1;
      else if (call.status === PhoneCallStatus.transferred) r.transferred += 1;
      if (human) {
        r.humanConnected += 1;
        r.humanInvolvedMinutes += minutes;
      } else if (call.status === PhoneCallStatus.completed) {
        r.aiContained += 1;
        r.aiOnlyMinutes += minutes;
      }
      if (call.providerCostCheckedAt && call.providerCost) {
        r.pricedCalls += 1;
        r.pricedCost += Number(call.providerCost);
      }
    }
    for (const review of reviews) {
      const score = review.overrideScore ?? review.computedScore;
      if (score == null) continue;
      const r = row(review.call.startedAt);
      r.qualityReviews += 1;
      r.qualityScoreSum += score;
    }
    for (const decision of decisions) {
      const r = row(decision.evaluatedAt);
      r.eligibilityChecks += 1;
      if (!decision.allowed) r.eligibilityBlocked += 1;
    }

    const series = [...rows.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => ({
        day: r.day,
        calls: r.calls,
        missed: r.missed,
        transferred: r.transferred,
        aiContained: r.aiContained,
        humanConnected: r.humanConnected,
        aiOnlyMinutes: Math.round(r.aiOnlyMinutes),
        humanInvolvedMinutes: Math.round(r.humanInvolvedMinutes),
        costPerPricedCall: r.pricedCalls ? r.pricedCost / r.pricedCalls : null,
        averageQualityScore: r.qualityReviews
          ? r.qualityScoreSum / r.qualityReviews
          : null,
        complianceBlockedRate: r.eligibilityChecks
          ? r.eligibilityBlocked / r.eligibilityChecks
          : null,
      }));
    const total = (key: keyof DayRow) =>
      [...rows.values()].reduce((sum, r) => sum + (r[key] as number), 0);
    return {
      windowDays: days,
      timeZone: tz,
      generatedAt: new Date().toISOString(),
      series,
      totals: {
        calls: total('calls'),
        missed: total('missed'),
        transferred: total('transferred'),
        aiContained: total('aiContained'),
        humanConnected: total('humanConnected'),
        aiOnlyMinutes: Math.round(total('aiOnlyMinutes')),
        humanInvolvedMinutes: Math.round(total('humanInvolvedMinutes')),
        pricedCalls: total('pricedCalls'),
        pricedCost: total('pricedCost'),
      },
      glossary: VOICE_METRIC_GLOSSARY,
      dataLag:
        'Figures update as provider callbacks arrive; recent calls may not be priced or reviewed yet.',
    };
  }
}
