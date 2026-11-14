import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiSummaryProviderFailure } from '../ai/ai-provider-error.util';
import { AppException } from '../common/filters/app.exception';
import {
  isSpecialistSourceModuleDisabledError,
  SpecialistAgentPolicyService,
} from '../common/agents/specialist-agent-policy.service';
import { hasRequiredSpecialistAgentAnswerSections } from '../common/agents/specialist-agent-answer.util';
import {
  SpecialistAgentToolGatewayService,
  type RegisteredSpecialistAgentTool,
} from '../common/agents/specialist-agent-tool-gateway.service';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunStartedEvent,
  recordSpecialistAgentRunTerminalEvent,
} from '../common/agents/specialist-agent-run-events.util';
import { specialistAgentRunDetailsHiddenByModuleSelection } from '../common/agents/specialist-agent-module-selection.util';
import {
  SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY,
  specialistAgentUntrustedData,
} from '../common/agents/specialist-agent-prompt.util';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SeoContentService } from '../marketing/seo-content.service';
import { SeoOnPageService } from '../marketing/seo-on-page.service';
import { SeoTechnicalService } from '../marketing/seo-technical.service';
import {
  SeoAgentWorkspaceService,
  type WorkspaceItem,
} from './seo-agent-workspace.service';
import {
  createOrReuseSpecialistAgentRun,
  SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
} from '../common/agents/specialist-agent-run-idempotency.util';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import {
  createSpecialistAgentParentRunRef,
  type SpecialistAgentRunOptions,
} from '../common/agents/specialist-agent-run-options';
import { SeoSearchConsoleService } from './seo-search-console.service';
import { SeoAnalyticsAttributionService } from './seo-analytics-attribution.service';
import { SeoReportsService } from './seo-reports.service';
import { SeoSettingsService } from './seo-settings.service';

const AGENT_KEY = 'seo_autopilot';
const AGENT_VERSION = '1.4.0';
const SEO_WORKSPACE_TOOL = 'get_seo_workspace_review';
const SEO_SEARCH_CONSOLE_TOOL = 'get_search_console_performance';
const SEO_ANALYTICS_TOOL = 'get_organic_search_attribution';
const SEO_OFF_PAGE_TOOL = 'get_merchant_off_page_summary';
const SEO_RANK_HISTORY_TOOL = 'get_rank_history';
const SEO_CRAWL_FINDINGS_TOOL = 'get_crawl_findings';
const SEO_ACTION_OUTCOMES_TOOL = 'get_seo_action_outcomes';
const SEO_COMPETITOR_EVIDENCE_TOOL = 'get_competitor_seo_evidence';
const SEO_SETTINGS_TOOL = 'get_seo_settings';
const MAX_SEO_QUESTION_LENGTH = 1_000;

const SEO_AGENT_TOOLS: readonly RegisteredSpecialistAgentTool[] = [
  {
    key: SEO_WORKSPACE_TOOL,
    label: 'Get SEO workspace review',
    description:
      'Read current SEO workspace counts and the next item selected by its canonical review order.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 262_144,
    screen: '/marketing/seo-autopilot/agent-workspace',
  },
  {
    key: SEO_SEARCH_CONSOLE_TOOL,
    label: 'Get Search Console performance',
    description:
      'Read saved Search Console property and tracked-keyword observations for this business.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    requiredModules: ['integrations'],
    maxOutputBytes: 262_144,
    screen: '/marketing/seo-autopilot',
  },
  {
    key: SEO_ANALYTICS_TOOL,
    label: 'Get Organic Search attribution',
    description:
      'Read the selected GA4 property’s saved Organic Search aggregate and landing-page evidence.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    requiredModules: ['integrations'],
    maxOutputBytes: 262_144,
    screen: '/marketing/seo-autopilot/reports',
  },
  {
    key: SEO_OFF_PAGE_TOOL,
    label: 'Get merchant-entered off-page summary',
    description:
      'Read tracked merchant-entered link, opportunity, guest-publication and pitch counts.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 262_144,
    screen: '/marketing/seo-autopilot/off-page',
  },
  {
    key: SEO_RANK_HISTORY_TOOL,
    label: 'Get tracked keyword rank history',
    description:
      'Read the business’s saved rank snapshots, recent movement and freshness. Search interest is a relative index, not search volume.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 262_144,
    screen: '/marketing/seo-autopilot/rank-tracking',
  },
  {
    key: SEO_CRAWL_FINDINGS_TOOL,
    label: 'Get grouped SEO crawl findings',
    description:
      'Read the latest completed crawl summary and grouped open issue counts by issue type and severity. Raw page content, query strings and crawler evidence are excluded.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 65_536,
    screen: '/marketing/seo-autopilot',
  },
  {
    key: SEO_ACTION_OUTCOMES_TOOL,
    label: 'Get applied SEO action observations',
    description:
      'Read recent tracked-rank and exact landing-page-path observations alongside applied On-Page or Technical actions. GA4 periods are property context, not action-timed results or proof of causality.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 131_072,
    screen: '/marketing/seo-autopilot/reports',
  },
  {
    key: SEO_COMPETITOR_EVIDENCE_TOOL,
    label: 'Get recorded competitor SEO evidence',
    description:
      'Read counts of team-entered competitor SEO observations by evidence type and status. Competitor data is not discovered automatically and authority/backlink totals are not tracked.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 65_536,
    screen: '/marketing/seo-autopilot/competitors',
  },
  {
    key: SEO_SETTINGS_TOOL,
    label: 'Get SEO configuration and data-source status',
    description:
      'Read the canonical SEO Settings summary, including site, market, audit schedule, AI-draft policy and provider configuration status. It never returns API credentials.',
    inputs: [],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 32_000,
    screen: '/marketing/seo-autopilot/settings',
  },
];

type SeoWorkspaceQueue = Awaited<ReturnType<SeoAgentWorkspaceService['queue']>>;
type SeoWorkspaceToolOutput = Pick<SeoWorkspaceQueue, 'kpis' | 'rules'> & {
  candidate:
    | (Omit<
        Pick<
          WorkspaceItem,
          'id' | 'kind' | 'stage' | 'status' | 'risk' | 'action' | 'updatedAt'
        >,
        'updatedAt'
      > & {
        updatedAt: string;
      })
    | null;
};

type SeoSearchPerformanceSnapshot = {
  startDate: string;
  endDate: string;
  clicks: string | null;
  impressions: string | null;
  clickThroughRate: number | null;
  averagePosition: number | null;
  dataState: string;
  fetchedAt: string;
};
type SeoSearchKeywordObservation = {
  keyword: string;
  startDate: string;
  endDate: string;
  clicks: string | null;
  impressions: string | null;
  clickThroughRate: number | null;
  averagePosition: number | null;
  dataState: string;
  fetchedAt: string;
};
type SeoSearchPerformanceEvidence = {
  propertyUrl: string | null;
  windowDays: number;
  snapshots: SeoSearchPerformanceSnapshot[];
} & (
  | {
      status: IntegrationStatus;
      trackedKeywordSummary: {
        trackedKeywordCount: number;
        latestWindowEnd: string | null;
        matchedKeywordCount: number;
        notReportedKeywordCount: number;
        observations: SeoSearchKeywordObservation[];
        observationsTruncated: boolean;
      };
    }
  | {
      status: 'not_evaluated';
      trackedKeywordSummary: {
        trackedKeywordCount: null;
        latestWindowEnd: null;
        matchedKeywordCount: null;
        notReportedKeywordCount: null;
        observations: [];
        observationsTruncated: false;
      };
    }
);
type SeoOffPageEvidence = {
  source: 'merchant_entered_records';
  trackedLinks: number;
  activeLinks: number;
  lostLinks: number;
  unverifiedLinks: number;
  openTrackedOpportunities: number;
  openOpportunitiesByPipelineStage: Array<{
    pipeline: string;
    stage: string;
    count: number;
  }>;
  guestPublications: number;
  guestPublicationStatuses: Record<string, number>;
  guestPitches: number;
  guestPitchStages: Record<string, number>;
};
type SeoRankHistoryEvidence = {
  source: 'tracked_keyword_rank_snapshots';
  trackedKeywordCount: number;
  keywordsWithSnapshots: number;
  staleKeywordCount: number;
  improving: number;
  declining: number;
  unchanged: number;
  notComparable: number;
  latestCapturedAt: string | null;
  observations: Array<{
    keyword: string;
    intent: string | null;
    targetPageUrl: string | null;
    latestRank: number | null;
    latestStatus: 'ranked' | 'not_in_results' | 'not_checked';
    previousRank: number | null;
    movement: 'improving' | 'declining' | 'unchanged' | 'not_comparable';
    searchInterestIndex: number | null;
    capturedAt: string | null;
    freshness: 'fresh' | 'stale' | 'missing';
  }>;
  truncated: boolean;
};
type SeoAnalyticsEvidence = Awaited<
  ReturnType<SeoAnalyticsAttributionService['agentEvidence']>
>;
type SeoCrawlFindingsEvidence = {
  source: string;
  latestAudit: {
    status: string;
    pagesDiscovered: number;
    pagesCrawled: number;
    issuesFound: number;
    finishedAt: string | null;
  } | null;
  openIssueCount: number;
  openIssuesByTypeAndSeverity: Array<{
    type: string;
    severity: string;
    count: number;
  }>;
  disclosure: string;
};
type SeoCompetitorEvidenceSummary = {
  source: string;
  trackedCompetitorCount: number;
  evidenceGroups: Array<{
    evidenceType: string;
    status: string;
    count: number;
  }>;
  latestObservationAt: string | null;
  disclosure: string;
};
type SeoReportSnapshot = Awaited<ReturnType<SeoReportsService['report']>>;
type SeoActionRankObservation = Pick<
  SeoReportSnapshot['actionRankOutcomes'][number],
  | 'kind'
  | 'label'
  | 'keyword'
  | 'baselineRank'
  | 'measuredRank'
  | 'rankChange'
  | 'state'
  | 'caveat'
> & {
  appliedAt: string;
  baselineCheckedAt: string | null;
  measuredAt: string | null;
};
type SeoActionPageObservation = {
  kind: 'on_page' | 'technical';
  label: string;
  targetPath: string | null;
  appliedAt: string;
  propertyName: string | null;
  currencyCode: string | null;
  comparisonPeriod: { startDate: string; endDate: string } | null;
  currentPeriod: { startDate: string; endDate: string } | null;
  comparison: {
    dataState: string;
    rows: Array<{
      sessions: string | null;
      keyEvents: string | null;
      totalRevenue: string | null;
    }>;
    truncated: boolean;
    reason: string | null;
  };
  current: {
    dataState: string;
    rows: Array<{
      sessions: string | null;
      keyEvents: string | null;
      totalRevenue: string | null;
    }>;
    truncated: boolean;
    reason: string | null;
  };
  fetchedAt: string | null;
  disclosure: string;
};
type SeoActionOutcomeEvidence = {
  period: {
    days: number;
    currentFrom: string;
    currentTo: string;
    baselineFrom: string;
    baselineTo: string;
  };
  trackedRankObservations: SeoActionRankObservation[];
  pageAnalyticsObservations: SeoActionPageObservation[];
  truncated: {
    trackedRankObservations: boolean;
    pageAnalyticsObservations: boolean;
  };
  pageAnalyticsUnavailableReason?: string | null;
};
type SeoSettingsEvidence = {
  site: { configured: boolean; source: string | null };
  market: { country: string | null; locale: string | null };
  autopilotLevel: string;
  aiDraftsEnabled: boolean;
  approvalPolicy: string;
  checks: Array<{ key: string; label: string; ok: boolean }>;
  configurationHealth: { ok: number; of: number };
  notConnected: Array<{ label: string; reason: string }>;
};

/*
 * The gateway serializes outputs to bounded JSON. Dates in the queue projection are therefore
 * ISO strings and are restored to Date only after the result has crossed that boundary.
 */

type AiSummary = {
  mode: 'review' | 'question';
  status: 'ready' | 'not_configured' | 'blocked' | 'unavailable';
  text: string | null;
  message: string | null;
  inputTokens: number;
  outputTokens: number;
};

const STAGE_PRIORITY = {
  waiting_approval: 0,
  not_matched: 1,
  verification_required: 2,
  new: 3,
  ready_to_apply: 4,
  draft_ready: 5,
  completed: 6,
} as const;

@Injectable()
export class SeoSpecialistAgentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly workspace: SeoAgentWorkspaceService,
    private readonly aiInfra: AiInfraService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly content: SeoContentService,
    private readonly onPage: SeoOnPageService,
    private readonly technical: SeoTechnicalService,
    private readonly searchConsole: SeoSearchConsoleService,
    private readonly analyticsAttribution: SeoAnalyticsAttributionService,
    private readonly reports: SeoReportsService,
    private readonly settings: SeoSettingsService,
    private readonly toolGateway: SpecialistAgentToolGatewayService,
  ) {
    this.toolGateway.registerAgentTools(
      AGENT_KEY,
      '28',
      SEO_AGENT_TOOLS,
      async (context, tool) => {
        const integrationsEnabled = !(
          await this.agentPolicy.disabledModulesForBusiness(
            context.businessId,
          )
        ).includes('integrations');
        switch (tool.key) {
          case SEO_WORKSPACE_TOOL: {
            const queue = await this.workspace.queue(context.businessId);
            const candidate = this.nextItem(queue.items);
            return {
              output: {
                kpis: queue.kpis,
                rules: queue.rules,
                candidate: candidate
                  ? {
                      id: candidate.id,
                      kind: candidate.kind,
                      stage: candidate.stage,
                      status: candidate.status,
                      risk: candidate.risk,
                      action: candidate.action,
                      updatedAt: candidate.updatedAt.toISOString(),
                    }
                  : null,
              },
              status: 'succeeded',
              summary: 'Read current SEO workspace counts and review order.',
              outputResourceType: 'SeoWorkspaceReview',
            };
          }
          case SEO_SEARCH_CONSOLE_TOOL:
            return {
              output: await this.searchPerformanceEvidence(
                context.businessId,
                integrationsEnabled,
              ),
              status: 'succeeded',
              summary: 'Read saved Search Console performance evidence.',
              outputResourceType: 'SeoSearchConsoleEvidence',
            };
          case SEO_ANALYTICS_TOOL:
            return {
              output: await this.analyticsAttribution.agentEvidence(
                context.businessId,
                integrationsEnabled,
              ),
              status: 'succeeded',
              summary: 'Read saved Organic Search attribution evidence.',
              outputResourceType: 'SeoAnalyticsEvidence',
            };
          case SEO_OFF_PAGE_TOOL:
            return {
              output: await this.merchantOffPageEvidence(context.businessId),
              status: 'succeeded',
              summary: 'Read merchant-entered off-page tracking counts.',
              outputResourceType: 'SeoOffPageSummary',
            };
          case SEO_RANK_HISTORY_TOOL:
            return {
              output: await this.rankHistoryEvidence(context.businessId),
              status: 'succeeded',
              summary: 'Read saved rank history for tracked keywords.',
              outputResourceType: 'SeoRankHistory',
            };
          case SEO_CRAWL_FINDINGS_TOOL:
            return {
              output: await this.crawlFindingsEvidence(context.businessId),
              status: 'succeeded',
              summary: 'Read the latest crawl and grouped open SEO issues.',
              outputResourceType: 'SeoCrawlFindingSummary',
            };
          case SEO_ACTION_OUTCOMES_TOOL: {
            const report = await this.reports.report(
              context.businessId,
              30,
              new Date(),
              { includeIntegrationData: integrationsEnabled },
            );
            const landingPages = report.actionLandingPageOutcomes.slice(0, 20);
            return {
              output: {
                period: {
                  days: report.period.days,
                  currentFrom: report.period.currentFrom.toISOString(),
                  currentTo: report.period.currentTo.toISOString(),
                  baselineFrom: report.period.baselineFrom.toISOString(),
                  baselineTo: report.period.baselineTo.toISOString(),
                },
                trackedRankObservations: report.actionRankOutcomes
                  .slice(0, 20)
                  .map((row) => ({
                    kind: row.kind,
                    label: row.label,
                    appliedAt: row.appliedAt.toISOString(),
                    keyword: row.keyword,
                    baselineRank: row.baselineRank,
                    baselineCheckedAt: row.baselineCheckedAt?.toISOString() ?? null,
                    measuredRank: row.measuredRank,
                    measuredAt: row.measuredAt?.toISOString() ?? null,
                    rankChange: row.rankChange,
                    state: row.state,
                    caveat: row.caveat,
                  })),
                pageAnalyticsObservations: integrationsEnabled
                  ? landingPages.map((row) => ({
                  kind: row.kind,
                  label: row.label,
                  targetPath: row.targetPath,
                  appliedAt: row.appliedAt.toISOString(),
                  propertyName: row.propertyName,
                  currencyCode: row.currencyCode,
                  comparisonPeriod: row.comparisonPeriod,
                  currentPeriod: row.currentPeriod,
                  comparison: {
                    dataState: row.comparison.dataState,
                    rows: row.comparison.rows.slice(0, 5).map((item) => ({
                      sessions: item.sessions,
                      keyEvents: item.keyEvents,
                      totalRevenue: item.totalRevenue,
                    })),
                    truncated: row.comparison.rows.length > 5,
                    reason: row.comparison.reason,
                  },
                  current: {
                    dataState: row.current.dataState,
                    rows: row.current.rows.slice(0, 5).map((item) => ({
                      sessions: item.sessions,
                      keyEvents: item.keyEvents,
                      totalRevenue: item.totalRevenue,
                    })),
                    truncated: row.current.rows.length > 5,
                    reason: row.current.reason,
                  },
                  fetchedAt: row.fetchedAt,
                  disclosure: row.disclosure,
                    }))
                  : [],
                truncated: {
                  trackedRankObservations: report.actionRankOutcomes.length > 20,
                  pageAnalyticsObservations:
                    integrationsEnabled &&
                    report.actionLandingPageOutcomes.length > 20,
                },
                pageAnalyticsUnavailableReason: integrationsEnabled
                  ? null
                  : 'GA4 landing-page evidence was not read because Integrations is disabled for this business.',
              },
              status: 'succeeded',
              summary:
                integrationsEnabled
                  ? 'Read bounded rank and GA4 landing-page observations for applied SEO actions.'
                  : 'Read bounded rank observations; GA4 page evidence was not evaluated because Integrations is disabled.',
              outputResourceType: 'SeoActionOutcomeObservations',
            };
          }
          case SEO_COMPETITOR_EVIDENCE_TOOL:
            return {
              output: await this.competitorEvidenceSummary(context.businessId),
              status: 'succeeded',
              summary: 'Read grouped, team-entered competitor SEO evidence.',
              outputResourceType: 'SeoCompetitorEvidenceSummary',
            };
          case SEO_SETTINGS_TOOL: {
            const settings = await this.settings.summary(context.businessId, {
              includeIntegrationData: integrationsEnabled,
            });
            return {
              output: {
                site: {
                  configured: Boolean(settings.site.url),
                  source: settings.site.source,
                },
                market: settings.market,
                autopilotLevel: settings.autopilotLevel,
                aiDraftsEnabled: settings.aiDraftsEnabled,
                approvalPolicy: settings.approvalPolicy,
                checks: settings.checks.map(({ key, label, ok }) => ({
                  key,
                  label,
                  ok,
                })),
                configurationHealth: settings.configurationHealth,
                notConnected: settings.notConnected,
              },
              status: 'succeeded',
              summary: 'Read canonical SEO configuration and provider status.',
              outputResourceType: 'SeoSettingsSummary',
            };
          }
          default:
            throw new AppException(
              'SEO_AGENT_TOOL_NOT_SUPPORTED',
              'This SEO tool is not supported by the canonical service.',
              HttpStatus.NOT_IMPLEMENTED,
            );
        }
      },
    );
  }

  async generateOpportunityBrief(
    businessId: string,
    actorUserId: string,
    keywordId: string,
    strategyNote?: string,
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'seo');
    const { opportunities } = await this.content.opportunities(businessId);
    const opportunity = opportunities.find(
      (item) => item.keywordId === keywordId,
    );
    if (!opportunity || !opportunity.kind) {
      throw new AppException(
        'SEO_AGENT_OPPORTUNITY_NOT_FOUND',
        'That keyword has no current content opportunity in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (opportunity.dismissed) {
      throw new AppException(
        'SEO_AGENT_OPPORTUNITY_DISMISSED',
        'Reopen this content opportunity before asking the agent to prepare a brief.',
        HttpStatus.CONFLICT,
      );
    }
    if (opportunity.briefId) {
      throw new AppException(
        'SEO_AGENT_BRIEF_ALREADY_EXISTS',
        'A content brief already exists for this opportunity. Open the existing brief instead.',
        HttpStatus.CONFLICT,
      );
    }

    return this.content.generateBrief(
      businessId,
      actorUserId,
      keywordId,
      strategyNote,
      'specialist_agent',
    );
  }

  async generateOnPageRevision(
    businessId: string,
    actorUserId: string,
    issueId: string,
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'seo');
    return this.onPage.suggestForAuditIssue(businessId, actorUserId, issueId);
  }

  async prepareTechnicalReview(
    businessId: string,
    actorUserId: string,
    issueId: string,
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'seo');
    return this.technical.createReviewFromAuditIssue(
      businessId,
      actorUserId,
      issueId,
    );
  }

  async listRuns(businessId?: string) {
    const runs = await this.tenantPrisma.client.specialistAgentRun.findMany({
      where: { agentKey: AGENT_KEY },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      include: {
        recommendations: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
          },
        },
        aiCallLogs: {
          select: {
            id: true,
            kind: true,
            inputTokens: true,
            outputTokens: true,
            estimatedCostUsd: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    const scopedBusinessId = businessId ?? runs[0]?.businessId;
    if (!scopedBusinessId) return runs;
    const disabledModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(scopedBusinessId),
    );
    return runs.map((run) => {
      if (
        !specialistAgentRunDetailsHiddenByModuleSelection(
          run.output,
          disabledModules,
          ['marketing', 'integrations'],
        )
      ) {
        return run;
      }
      return {
        ...run,
        output: {
          summary:
            'Saved SEO agent details are hidden because a source module used by the review is disabled. Enable the module and run a new review to refresh the snapshot.',
        },
        recommendations: [],
      };
    });
  }

  async run(
    businessId: string,
    actorUserId: string | null,
    idempotencyKey?: string,
    options: SpecialistAgentRunOptions = {},
    question?: string,
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'seo');
    const integrationsEnabled = !(
      await this.agentPolicy.disabledModulesForBusiness(businessId)
    ).includes('integrations');
    const normalizedQuestion = question?.trim() || null;
    if (
      question !== undefined &&
      (!normalizedQuestion ||
        normalizedQuestion.length < 4 ||
        normalizedQuestion.length > MAX_SEO_QUESTION_LENGTH)
    ) {
      throw new AppException(
        'SEO_AGENT_QUESTION_INVALID',
        `Enter an SEO question between 4 and ${MAX_SEO_QUESTION_LENGTH} characters.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const questionHash = normalizedQuestion
      ? createHash('sha256').update(normalizedQuestion).digest('hex')
      : null;
    const startedAt = new Date();
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '28',
      triggerType: options.triggerType ?? 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        ...(options.parentRunId
          ? [createSpecialistAgentParentRunRef(options.parentRunId)]
          : []),
        options.triggerRef
          ? {
              source: options.triggerRef.sourceModule,
              scope: 'current_business',
              containsExternalProviderMetrics: false,
              eventId: options.triggerRef.eventId,
              entityType: options.triggerRef.entityType,
              entityId: options.triggerRef.entityId,
              occurredAt: options.triggerRef.occurredAt,
              entityVersion: options.triggerRef.entityVersion,
              schemaVersion: options.triggerRef.schemaVersion,
              correlationId: options.triggerRef.correlationId,
            }
          : {
              source: 'SeoAgentWorkspaceService.queue',
              scope: 'current_business',
              containsExternalProviderMetrics: false,
            },
        {
          source: 'SeoOffPageLink and SeoOffPageOpportunity merchant records',
          scope: 'current_business',
          containsExternalProviderMetrics: false,
        },
        {
          source: 'SeoGuestPublication and SeoGuestPitch merchant records',
          scope: 'current_business',
          containsExternalProviderMetrics: false,
        },
        ...(integrationsEnabled
          ? [
              {
                source: 'Google Analytics Data API',
                scope: 'selected_property_aggregate_Organic_Search_channel',
                containsExternalProviderMetrics: true,
              },
              {
                source: 'Google Search Console API',
                scope: 'selected_property_and_tracked_keyword_saved_observations',
                containsExternalProviderMetrics: true,
              },
            ]
          : [
              {
                source: 'Integrations module selection',
                scope: 'Google Analytics and Search Console data were not evaluated',
                containsExternalProviderMetrics: false,
              },
            ]),
        {
          source: 'TrackedKeyword and KeywordRankSnapshot',
          scope: 'current_business_saved_rank_history',
          containsExternalProviderMetrics: false,
        },
        {
          source: 'SeoAuditRun and SeoAuditIssue grouped summary',
          scope: 'current_business_saved_crawl_findings',
          containsExternalProviderMetrics: false,
        },
        {
          source: 'SeoReportsService applied action observations',
          scope: 'current_business_saved_action_outcomes',
          containsExternalProviderMetrics: true,
        },
        {
          source: 'SeoCompetitorGap team-entered evidence aggregates',
          scope: 'current_business_manual_competitor_evidence',
          containsExternalProviderMetrics: false,
        },
        {
          source: 'SeoSettingsService configuration summary',
          scope: 'current_business_seo_configuration',
          containsExternalProviderMetrics: false,
        },
        ...(questionHash
          ? [
              {
                source: 'seo_agent_read_only_question',
                scope: 'current_business_saved_seo_evidence',
                questionSha256: questionHash,
                questionStored: false,
              },
            ]
          : []),
      ],
      policyResult: {
        autonomyLevel: 'L0',
        riskTier: 'low',
        readOnly: true,
        publishesToWebsite: false,
        sendsOutreach: false,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          await recordSpecialistAgentRunStartedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: {
            businessId: keyBusinessId,
            agentKey,
            idempotencyKeyHash,
          },
        }),
      runData,
      idempotencyKey,
      { businessId, questionHash },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenantPrisma.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    const run = reservation.run;
    if (reservation.reused) {
      const existing = await this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: { id: run.id, businessId, agentKey: AGENT_KEY },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
      if (integrationsEnabled) return existing;
      return {
        ...existing,
        output: {
          summary:
            'Saved SEO agent details are hidden because Integrations is disabled. Enable Integrations and run a new review to refresh the snapshot.',
        },
        recommendations: [],
      };
    }

    try {
      const observedAt = new Date();
      const [
        queueEvidence,
        searchPerformance,
        analyticsAttribution,
        offPageRecords,
        rankHistory,
        crawlFindings,
        actionOutcomes,
        competitorEvidence,
        seoSettings,
      ] = await Promise.all([
        this.executeReadOnlyTool<SeoWorkspaceToolOutput>(
          businessId,
          actorUserId,
          run.id,
          1,
          SEO_WORKSPACE_TOOL,
        ),
        this.executeReadOnlyTool<SeoSearchPerformanceEvidence>(
          businessId,
          actorUserId,
          run.id,
          2,
          SEO_SEARCH_CONSOLE_TOOL,
        ),
        this.executeReadOnlyTool<SeoAnalyticsEvidence>(
          businessId,
          actorUserId,
          run.id,
          3,
          SEO_ANALYTICS_TOOL,
        ),
        this.executeReadOnlyTool<SeoOffPageEvidence>(
          businessId,
          actorUserId,
          run.id,
          4,
          SEO_OFF_PAGE_TOOL,
        ),
        this.executeReadOnlyTool<SeoRankHistoryEvidence>(
          businessId,
          actorUserId,
          run.id,
          5,
          SEO_RANK_HISTORY_TOOL,
        ),
        this.executeReadOnlyTool<SeoCrawlFindingsEvidence>(
          businessId,
          actorUserId,
          run.id,
          6,
          SEO_CRAWL_FINDINGS_TOOL,
        ),
        this.executeReadOnlyTool<SeoActionOutcomeEvidence>(
          businessId,
          actorUserId,
          run.id,
          7,
          SEO_ACTION_OUTCOMES_TOOL,
        ),
        this.executeReadOnlyTool<SeoCompetitorEvidenceSummary>(
          businessId,
          actorUserId,
          run.id,
          8,
          SEO_COMPETITOR_EVIDENCE_TOOL,
        ),
        this.executeReadOnlyTool<SeoSettingsEvidence>(
          businessId,
          actorUserId,
          run.id,
          9,
          SEO_SETTINGS_TOOL,
        ),
      ]);
      const queue = {
        kpis: queueEvidence.kpis,
        rules: queueEvidence.rules,
      };
      const candidate = queueEvidence.candidate
        ? {
            ...queueEvidence.candidate,
            updatedAt: new Date(queueEvidence.candidate.updatedAt),
          }
        : null;
      if (candidate && !Number.isFinite(candidate.updatedAt.getTime())) {
        throw new AppException(
          'SEO_AGENT_TOOL_OUTPUT_INVALID',
          'The SEO workspace tool returned an invalid review timestamp.',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const snapshot = {
        queueCounts: queue.kpis,
        newFindingWindowDays: queue.rules.newFindingDays,
        completedWindowDays: queue.rules.completedDays,
        searchPerformance,
        rankHistory,
        crawlFindings,
        actionOutcomes,
        competitorEvidence,
        seoSettings,
        analyticsAttribution:
          analyticsAttribution as unknown as Prisma.InputJsonObject,
        offPageRecords,
        currentReview: candidate
          ? {
              kind: candidate.kind,
              stage: candidate.stage,
              risk: candidate.risk,
              action: candidate.action,
            }
          : null,
      } satisfies Prisma.InputJsonObject;
      const searchContext =
        searchPerformance.status === 'not_evaluated'
          ? ' Search Console performance was not evaluated because Integrations is disabled for this business.'
          : searchPerformance.snapshots.length
            ? ` Search Console has real property-level data for ${searchPerformance.snapshots[0].startDate} to ${searchPerformance.snapshots[0].endDate}: ${searchPerformance.snapshots[0].clicks ?? 'clicks unavailable'} clicks and ${searchPerformance.snapshots[0].impressions ?? 'impressions unavailable'} impressions. This does not prove the cause of any change.`
            : ' Search performance is not available in this review because Search Console is not connected, has no selected property, or has not been synced.';
      const keywordSearchContext = searchPerformance.trackedKeywordSummary
        .latestWindowEnd
        ? ` The latest Search Console keyword window ends ${searchPerformance.trackedKeywordSummary.latestWindowEnd}; Google reported ${searchPerformance.trackedKeywordSummary.matchedKeywordCount} tracked term(s) and did not return ${searchPerformance.trackedKeywordSummary.notReportedKeywordCount}. Not returned is not treated as zero.`
        : searchPerformance.status === 'not_evaluated'
          ? ' Tracked-keyword Search Console observations were not evaluated because Integrations is disabled.'
          : ' Tracked-keyword Search Console observations are not available yet.';
      const offPageContext = ` Team-entered off-page records: ${offPageRecords.trackedLinks} tracked links (${offPageRecords.activeLinks} active, ${offPageRecords.lostLinks} marked lost, ${offPageRecords.unverifiedLinks} unverified), ${offPageRecords.openTrackedOpportunities} tracked open opportunities, ${offPageRecords.guestPublications} publications, and ${offPageRecords.guestPitches} pitches. These records are not provider-verified backlink coverage or authority metrics.`;
      const rankHistoryContext = rankHistory.trackedKeywordCount > 0
        ? ` Saved rank history covers ${rankHistory.keywordsWithSnapshots} of ${rankHistory.trackedKeywordCount} tracked keywords; among comparable recent observations, ${rankHistory.improving} improved, ${rankHistory.declining} declined and ${rankHistory.unchanged} were unchanged. ${rankHistory.staleKeywordCount} latest observations are older than seven days. These are observed positions, not a promise or causal result.${rankHistory.observations.some((item) => item.searchInterestIndex !== null) ? ' Search interest values are Google Trends relative 0–100 indices, not monthly search volume.' : ''}`
        : ' No tracked keywords are set up, so rank movement is not available.';
      const crawlContext = crawlFindings.latestAudit
        ? ` Latest saved crawl finished ${crawlFindings.latestAudit.finishedAt ?? 'at an unrecorded time'} with ${crawlFindings.latestAudit.pagesCrawled} of ${crawlFindings.latestAudit.pagesDiscovered} discovered pages crawled and ${crawlFindings.latestAudit.issuesFound} issues recorded; ${crawlFindings.openIssueCount} issues are currently open. A partial crawl may not cover every page.`
        : ' No completed or partial site audit is available, so current crawl findings are not available.';
      const manualCompetitorObservationCount = competitorEvidence.evidenceGroups.reduce(
        (sum, group) => sum + group.count,
        0,
      );
      const competitorContext = ` The business has ${competitorEvidence.trackedCompetitorCount} tracked competitor record(s) and ${manualCompetitorObservationCount} team-entered SEO observation(s). These are manual records, not automatic competitor research.`;
      const matchedActionPageCount = actionOutcomes.pageAnalyticsObservations.filter(
        (row) => row.current.rows.length > 0 || row.comparison.rows.length > 0,
      ).length;
      const actionOutcomeContext = integrationsEnabled
        ? ` The 30-day report returned ${actionOutcomes.trackedRankObservations.length} applied-action rank observation(s) and ${matchedActionPageCount} action page(s) with at least one exact-path GA4 period match. GA4 observations are period context, not action-timed or causal measurements.`
        : ` The 30-day report returned ${actionOutcomes.trackedRankObservations.length} applied-action rank observation(s). GA4 page evidence was not evaluated because Integrations is disabled.`;
      const settingsContext = ` SEO Settings report ${seoSettings.configurationHealth.ok} of ${seoSettings.configurationHealth.of} readiness checks as ready; provider credentials are not included in this review.`;
      const organicWindow = analyticsAttribution.current;
      const landingPages = organicWindow?.landingPages;
      const landingPageContext =
        landingPages?.dataState === 'returned'
          ? ` GA4 also returned Organic Search landing-page paths with sessions, key events and property-reported revenue; the saved page rows are included as source evidence. They do not establish page quality or SEO causality.`
          : landingPages?.dataState === 'no_data_returned'
            ? ' Google Analytics returned no Organic Search landing-page rows for the current period.'
            : ' Page-level GA4 data is not available in the latest saved snapshot.';
      const analyticsContext = !integrationsEnabled
        ? ' Google Analytics attribution was not evaluated because Integrations is disabled for this business.'
        : organicWindow
          ? ` Google Analytics reports ${organicWindow.sessions ?? 'sessions unavailable'} Organic Search sessions, ${organicWindow.keyEvents ?? 'key events unavailable'} key events, and ${organicWindow.totalRevenue === null ? 'revenue unavailable' : `${analyticsAttribution.currencyCode ?? 'property currency unavailable'} ${organicWindow.totalRevenue}`} for ${organicWindow.startDate} to ${organicWindow.endDate}; the prior ${analyticsAttribution.windowDays}-day comparison is stored separately. GA4 channel attribution is descriptive and does not show that SEO work caused the result.${landingPageContext}`
          : ` Google Analytics attribution is unavailable: ${analyticsAttribution.unavailableReason ?? 'the latest saved Organic Search snapshot is not available'}`;
      const summary = candidate
        ? `The existing SEO Workspace has ${queue.kpis.waitingApproval} item(s) waiting approval and ${queue.kpis.verificationRequired} requiring verification. Review ${candidate.action} (${candidate.kind.replaceAll('_', ' ')}, ${candidate.stage}, ${candidate.risk} risk) in its canonical screen. This is a queue triage, not a calibrated impact score.${crawlContext}${rankHistoryContext}${searchContext}${keywordSearchContext}${analyticsContext}${offPageContext}${competitorContext}${actionOutcomeContext}${settingsContext}`
        : `The existing SEO Workspace currently has no open findings or in-progress changes in its configured windows.${crawlContext}${rankHistoryContext}${searchContext}${keywordSearchContext}${analyticsContext}${offPageContext}${competitorContext}${actionOutcomeContext}${settingsContext}`;
      const assumptions = [
        'Queue counts and item status are read from the existing SEO Workspace service; this run does not recreate its lifecycle or approve any action.',
        'The suggested review order is a deterministic stage order (approval, verification mismatch, verification, new finding, ready to apply, draft); it is not a calibrated business-impact score.',
        'Rank movement compares the two latest saved numeric rank observations per tracked keyword; lower positions are better. Missing snapshots and keywords absent from a provider result are not treated as rank zero.',
        'Rank observations describe changes over time only. They do not establish that a recommendation, page revision, publication or other SEO action caused the change.',
        'Off-page counts come only from tracked merchant-entered Noxtill records and do not represent an external backlink index or authority score.',
        'Google Analytics values use the selected property and its Organic Search session channel group. Key events and total revenue follow that property’s GA4 attribution settings; period comparisons do not establish that SEO actions caused an outcome.',
        'Crawl summary counts come from saved Noxtill audit records. Raw page text and individual affected URLs are omitted; incomplete crawl coverage does not establish that unvisited pages have no issues.',
        'Competitor counts describe team-entered records. They are not automatically discovered, independently verified or a backlink authority measure.',
        'SEO readiness checks are configuration status, not a score for site quality or expected search performance.',
      ];
      const missingData = [
        ...(rankHistory.trackedKeywordCount === 0
          ? ['No tracked keywords are configured, so rank observations are unavailable.']
          : rankHistory.keywordsWithSnapshots < rankHistory.trackedKeywordCount
            ? ['Some tracked keywords have no saved rank snapshot yet; missing observations are not treated as a rank of zero.']
            : []),
        ...(searchPerformance.status === 'not_evaluated'
          ? [
              'Search Console performance was not evaluated because Integrations is disabled.',
            ]
          : searchPerformance.snapshots.length
            ? []
            : [
                'Search Console performance is not available in this review, so clicks and impressions are not estimated.',
              ]),
        ...(searchPerformance.status === 'not_evaluated'
          ? []
          : searchPerformance.trackedKeywordSummary.latestWindowEnd
            ? searchPerformance.trackedKeywordSummary.notReportedKeywordCount > 0
              ? [
                  'Search Console did not return every tracked keyword; omitted terms are not treated as zero activity.',
                ]
              : []
            : [
                'No tracked-keyword Search Console snapshot is available for this review.',
              ]),
        ...(offPageRecords.trackedLinks > 0 ||
        offPageRecords.openTrackedOpportunities > 0 ||
        offPageRecords.guestPublications > 0 ||
        offPageRecords.guestPitches > 0
          ? []
          : [
              'No tracked team-entered off-page or guest-post records are available for this review.',
            ]),
        ...(!crawlFindings.latestAudit
          ? ['No completed or partial saved crawl is available for this review.']
          : []),
        ...(competitorEvidence.trackedCompetitorCount === 0
          ? ['No competitor records are tracked in this business; competitor observations are not inferred.']
          : []),
        ...(actionOutcomes.trackedRankObservations.length === 0 &&
        actionOutcomes.pageAnalyticsObservations.length === 0
          ? ['No applied On-Page or Technical actions with saved period outcome context were returned.']
          : []),
        ...(!integrationsEnabled
          ? []
          : analyticsAttribution.current
            ? []
            : [
                `Google Analytics Organic Search metrics are unavailable because ${analyticsAttribution.unavailableReason ?? 'no saved snapshot exists'}; these values are not estimated.`,
              ]),
        'Provider-wide backlink authority and search-volume figures are not available here; no rank or search outcome is inferred from queue state.',
        'No website changes, indexing requests or external outreach are performed by this read-only review.',
      ];
      const includedSourceModules = [
        'marketing',
        ...(integrationsEnabled ? ['integrations'] : []),
      ];
      await this.toolGateway.assertToolSourcesEnabled(
        businessId,
        AGENT_KEY,
        [],
        { actorUserId, runId: run.id },
      );
      const aiSummary =
        options.includeAiSummary === false && !normalizedQuestion
          ? null
          : await this.summarize(
              businessId,
              snapshot,
              run.id,
              normalizedQuestion,
              includedSourceModules,
            );
      await this.toolGateway.assertToolSourcesEnabled(
        businessId,
        AGENT_KEY,
        [],
        { actorUserId, runId: run.id },
      );
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        businessId,
        includedSourceModules,
      );
      const finishedAt = new Date();
      const output = {
        source: 'SeoAgentWorkspaceService.queue',
        moduleSelectionVersion: 1,
        moduleSources: {
          marketing: 'included',
          integrations: integrationsEnabled ? 'included' : 'disabled',
        },
        snapshot,
        summary,
        aiSummary,
        coverage: integrationsEnabled
          ? 'workspace_queue_saved_crawl_findings_rank_history_search_console_google_analytics_action_outcomes_competitor_evidence_settings_and_merchant_entered_off_page_records'
          : 'workspace_queue_saved_crawl_findings_rank_history_action_outcomes_competitor_evidence_settings_and_merchant_entered_off_page_records_integrations_not_evaluated',
        observedAt: observedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      } satisfies Prisma.InputJsonObject;
      const resourceType = candidate
        ? this.resourceType(candidate.kind)
        : 'seo_workspace_queue';
      const resourceId = candidate?.id ?? businessId;
      const observedValues = candidate
        ? ({
            kind: candidate.kind,
            stage: candidate.stage,
            status: candidate.status,
            risk: candidate.risk,
            action: candidate.action,
            updatedAt: candidate.updatedAt.toISOString(),
          } satisfies Prisma.InputJsonObject)
        : snapshot;

      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await this.agentPolicy.assertAgentEnabledInTransaction(
          tx,
          businessId,
          'seo',
        );
        await this.agentPolicy.assertSourceModulesEnabledInTransaction(
          tx,
          businessId,
          includedSourceModules,
        );
        await this.toolGateway.assertToolSourcesEnabledInTransaction(
          tx,
          businessId,
          AGENT_KEY,
          [],
          { actorUserId, runId: run.id },
        );
        const completed = await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            output,
            finishedAt,
            recommendations: {
              create: [
                {
                  business: { connect: { id: businessId } },
                  agentKey: AGENT_KEY,
                  title: candidate
                    ? 'Review the next SEO queue item'
                    : 'SEO workspace is clear',
                  summary,
                  classification: 'calculated',
                  details: snapshot,
                  assumptions,
                  missingData,
                  confidenceValue: null,
                  confidenceMethod: 'not_available',
                  riskTier: candidate?.risk ?? 'low',
                  approvalRequired: false,
                  status: 'proposed',
                  evidence: {
                    create: [
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_tracked_keyword_rank_history',
                        resourceId: businessId,
                        fieldRefs: [
                          'TrackedKeyword.keyword',
                          'TrackedKeyword.intent',
                          'TrackedKeyword.targetPageUrl',
                          'KeywordRankSnapshot.rank',
                          'KeywordRankSnapshot.searchInterest',
                          'KeywordRankSnapshot.capturedAt',
                        ],
                        observedValues: rankHistory as unknown as Prisma.InputJsonObject,
                        observedAt: rankHistory.latestCapturedAt
                          ? new Date(rankHistory.latestCapturedAt)
                          : observedAt,
                        fetchedAt: finishedAt,
                        freshness:
                          rankHistory.keywordsWithSnapshots === 0
                            ? 'missing'
                            : rankHistory.staleKeywordCount > 0
                              ? 'stale'
                              : 'fresh',
                        calculation:
                          'Latest two saved KeywordRankSnapshot rows per tracked keyword. Improvement means the newer numeric rank is lower; decline means it is higher. Null rank is reported as not in results, not rank zero. Snapshots older than seven days are stale. Search interest is stored as a relative Google Trends index, not search volume.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType,
                        resourceId,
                        fieldRefs: candidate
                          ? ['status', 'stage', 'risk', 'updatedAt']
                          : ['queue.kpis', 'queue.rules'],
                        observedValues,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: 'fresh',
                        calculation:
                          'SeoAgentWorkspaceService.queue; queue counts are grouped by the owning SEO records’ current stages. The suggested item uses a fixed stage order and is not an impact score.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_off_page_and_guest_post_review',
                        resourceId: businessId,
                        fieldRefs: [
                          'SeoOffPageLink.tracked.status',
                          'SeoOffPageOpportunity.tracked.status.pipeline.stage',
                          'SeoGuestPublication.status',
                          'SeoGuestPitch.stage',
                        ],
                        observedValues: offPageRecords,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: 'fresh',
                        calculation:
                          'Business-scoped counts grouped from existing merchant-entered Off-Page SEO and Guest Posting records. Counts do not represent a provider-wide backlink index, domain authority, or independently verified placements.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'external_provider',
                        resourceType: 'google_analytics_organic_search',
                        resourceId: analyticsAttribution.property ?? businessId,
                        fieldRefs: [
                          'sessionDefaultChannelGroup=Organic Search',
                          'sessions',
                          'keyEvents',
                          'totalRevenue',
                          'landingPage',
                          'landingPage.sessions',
                          'landingPage.keyEvents',
                          'landingPage.totalRevenue',
                          'currentWindow',
                          'comparisonWindow',
                        ],
                        observedValues:
                          analyticsAttribution as unknown as Prisma.InputJsonObject,
                        observedAt: analyticsAttribution.fetchedAt
                          ? new Date(analyticsAttribution.fetchedAt)
                          : observedAt,
                        fetchedAt: finishedAt,
                        freshness: analyticsAttribution.fetchedAt
                          ? Date.now() -
                              Date.parse(analyticsAttribution.fetchedAt) <=
                            35 * 24 * 60 * 60 * 1000
                            ? 'fresh'
                            : 'stale'
                          : 'missing',
                        calculation:
                          'Google Analytics Data API aggregate filtered to the selected property’s Organic Search session channel group. Sessions, key events and total revenue are values returned by GA4. Key events and revenue follow property attribution settings; no causal SEO impact is calculated.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_crawl_finding_summary',
                        resourceId: businessId,
                        fieldRefs: [
                          'SeoAuditRun.status',
                          'SeoAuditRun.pagesDiscovered',
                          'SeoAuditRun.pagesCrawled',
                          'SeoAuditRun.issuesFound',
                          'SeoAuditIssue.status',
                          'SeoAuditIssue.type',
                          'SeoAuditIssue.severity',
                        ],
                        observedValues:
                          crawlFindings as unknown as Prisma.InputJsonObject,
                        observedAt: crawlFindings.latestAudit?.finishedAt
                          ? new Date(crawlFindings.latestAudit.finishedAt)
                          : observedAt,
                        fetchedAt: finishedAt,
                        freshness: crawlFindings.latestAudit?.finishedAt
                          ? Date.now() -
                              Date.parse(crawlFindings.latestAudit.finishedAt) <=
                            7 * DAY_MS
                            ? 'fresh'
                            : 'stale'
                          : 'missing',
                        calculation:
                          'Latest saved completed/partial SEO audit plus the current grouped count of open SeoAuditIssue records. Grouping is by stored type and severity. Raw page text, URLs, and Search Console index state are excluded; a partial crawl is not complete site coverage.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_action_outcome_observations',
                        resourceId: businessId,
                        fieldRefs: [
                          'SeoContentRevision.appliedAt',
                          'SeoTechnicalAction.appliedAt',
                          'KeywordRankSnapshot.rank',
                          'GoogleAnalyticsOrganicSearch.landingPage',
                          'GoogleAnalyticsOrganicSearch.sessions',
                          'GoogleAnalyticsOrganicSearch.keyEvents',
                          'GoogleAnalyticsOrganicSearch.totalRevenue',
                        ],
                        observedValues:
                          actionOutcomes as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness:
                          actionOutcomes.pageAnalyticsObservations.some(
                            (item) => item.fetchedAt !== null,
                          )
                            ? 'provider_snapshot'
                            : actionOutcomes.trackedRankObservations.length > 0
                              ? 'rank_observation_only'
                              : 'missing',
                        calculation:
                          'Recent applied On-Page and Technical actions are associated with saved tracked-rank observations and GA4 Organic Search landing-page rows matched by exact path. The periods are not action-timed; the evidence is descriptive and does not establish causality or reconcile to Noxtill orders.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_competitor_evidence_summary',
                        resourceId: businessId,
                        fieldRefs: [
                          'Competitor.businessId',
                          'SeoCompetitorGap.kind',
                          'SeoCompetitorGap.status',
                          'SeoCompetitorGap.observedAt',
                        ],
                        observedValues:
                          competitorEvidence as unknown as Prisma.InputJsonObject,
                        observedAt: competitorEvidence.latestObservationAt
                          ? new Date(competitorEvidence.latestObservationAt)
                          : observedAt,
                        fetchedAt: finishedAt,
                        freshness: competitorEvidence.latestObservationAt
                          ? 'dated_merchant_observation'
                          : 'missing',
                        calculation:
                          'Counts of saved team-entered competitor SEO records grouped by kind and status. Competitor discoveries, backlink authority, page comparisons and traffic are not inferred.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'seo_configuration_status',
                        resourceId: businessId,
                        fieldRefs: [
                          'Business.country',
                          'Business.locale',
                          'Business.policies.seo.aiDraftsEnabled',
                          'SeoAuditSchedule.enabled',
                          'Integration.google_analytics.status',
                          'SERPAPI_KEY.configured',
                        ],
                        observedValues:
                          seoSettings as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: 'fresh',
                        calculation:
                          'Canonical SeoSettingsService readiness summary at review time. Configuration checks are not a site-quality score; provider secrets are not returned.',
                      },
                    ],
                  },
                },
              ],
            },
          },
          include: {
            recommendations: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: {
                evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
              },
            },
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'completed',
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'seo_agent.run',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: AGENT_KEY,
              agentVersion: AGENT_VERSION,
              status: completed.status,
              candidateKind: candidate?.kind ?? null,
              questionSha256: questionHash,
            },
          },
        });
        return completed;
      });
    } catch (error) {
      const failedAt = new Date();
      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: 'SEO_AGENT_RUN_FAILED',
            errorMessage: 'The current SEO workspace could not be reviewed.',
            finishedAt: failedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'failed',
          failedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'seo_agent.run_failed',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: { agentKey: AGENT_KEY, status: 'failed' },
          },
        });
      });
      if (error instanceof AppException) throw error;
      throw new AppException(
        'SEO_AGENT_RUN_FAILED',
        'The current SEO workspace could not be reviewed.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async executeReadOnlyTool<T>(
    businessId: string,
    actorUserId: string | null,
    runId: string,
    sequence: number,
    toolKey: string,
  ): Promise<T> {
    const result = await this.toolGateway.execute({
      agentKey: AGENT_KEY,
      moduleId: '28',
      businessId,
      actorUserId,
      runId,
      correlationId: runId,
      round: 1,
      sequence,
      toolKey,
      input: {},
      mode: 'read_only',
      authorize: () => this.agentPolicy.assertEnabled(businessId, 'seo'),
    });
    if (result.status !== 'succeeded') {
      throw new AppException(
        'SEO_AGENT_TOOL_NOT_SUCCEEDED',
        'An SEO evidence tool did not complete successfully.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return result.output as T;
  }

  private nextItem(items: WorkspaceItem[]): WorkspaceItem | null {
    return (
      [...items]
        .filter((item) => item.stage !== 'completed')
        .sort((a, b) => {
          const priority = STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage];
          return priority || b.updatedAt.getTime() - a.updatedAt.getTime();
        })[0] ?? null
    );
  }

  private async searchPerformanceEvidence(
    businessId: string,
    integrationsEnabled = true,
  ): Promise<SeoSearchPerformanceEvidence> {
    if (!integrationsEnabled) {
      return {
        status: 'not_evaluated',
        propertyUrl: null,
        windowDays: 28,
        snapshots: [],
        trackedKeywordSummary: {
          trackedKeywordCount: null,
          latestWindowEnd: null,
          matchedKeywordCount: null,
          notReportedKeywordCount: null,
          observations: [],
          observationsTruncated: false,
        },
      };
    }
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.google_search_console,
        },
      },
      select: { status: true, meta: true },
    });
    const meta =
      integration?.meta &&
      typeof integration.meta === 'object' &&
      !Array.isArray(integration.meta)
        ? (integration.meta as Record<string, unknown>)
        : {};
    const selectedProperty =
      typeof meta.searchConsoleSelectedProperty === 'string'
        ? meta.searchConsoleSelectedProperty
        : null;
    const rows =
      integration?.status === IntegrationStatus.connected && selectedProperty
        ? await this.tenantPrisma.client.seoSearchConsoleSnapshot.findMany({
            where: { businessId, propertyUrl: selectedProperty },
            orderBy: [{ endDate: 'desc' }, { fetchedAt: 'desc' }],
            take: 2,
          })
        : [];
    const keywordSummary =
      await this.searchConsole.keywordPerformanceSummary(businessId);
    const keywordObservations = keywordSummary.windows
      .flatMap((row) => {
        const latest = row.snapshots[0];
        return latest
          ? [
              {
                keyword: row.keyword,
                startDate: latest.startDate,
                endDate: latest.endDate,
                clicks: latest.clicks,
                impressions: latest.impressions,
                clickThroughRate: latest.clickThroughRate,
                averagePosition: latest.averagePosition,
                dataState: latest.dataState,
                fetchedAt: latest.fetchedAt.toISOString(),
              },
            ]
          : [];
      })
      .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt));
    return {
      status: integration?.status ?? IntegrationStatus.not_connected,
      propertyUrl: selectedProperty,
      windowDays: 28,
      snapshots: rows.map((row) => ({
        startDate: row.startDate,
        endDate: row.endDate,
        clicks: row.clicks?.toString() ?? null,
        impressions: row.impressions?.toString() ?? null,
        clickThroughRate: row.clickThroughRate?.toNumber() ?? null,
        averagePosition: row.averagePosition?.toNumber() ?? null,
        dataState: row.dataState,
        fetchedAt: row.fetchedAt.toISOString(),
      })),
      trackedKeywordSummary: {
        trackedKeywordCount: keywordSummary.trackedKeywordCount,
        latestWindowEnd: keywordSummary.latestWindowEnd,
        matchedKeywordCount: keywordSummary.matchedKeywordCount,
        notReportedKeywordCount: keywordSummary.notReportedKeywordCount,
        observations: keywordObservations.slice(0, 50),
        observationsTruncated: keywordObservations.length > 50,
      },
    };
  }

  private async crawlFindingsEvidence(businessId: string) {
    const db = this.tenantPrisma.client;
    const [latestAudit, issueGroups, openIssueCount] = await Promise.all([
      db.seoAuditRun.findFirst({
        where: {
          businessId,
          status: { in: ['completed', 'partial'] },
        },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          pagesDiscovered: true,
          pagesCrawled: true,
          issuesFound: true,
          finishedAt: true,
        },
      }),
      db.seoAuditIssue.groupBy({
        by: ['type', 'severity'],
        where: { businessId, status: 'open' },
        _count: { _all: true },
        orderBy: [{ type: 'asc' }, { severity: 'asc' }],
      }),
      db.seoAuditIssue.count({ where: { businessId, status: 'open' } }),
    ]);
    return {
      source: 'saved_seo_audit_runs_and_open_issues',
      latestAudit: latestAudit
        ? {
            status: latestAudit.status,
            pagesDiscovered: latestAudit.pagesDiscovered,
            pagesCrawled: latestAudit.pagesCrawled,
            issuesFound: latestAudit.issuesFound,
            finishedAt: latestAudit.finishedAt?.toISOString() ?? null,
          }
        : null,
      openIssueCount,
      openIssuesByTypeAndSeverity: issueGroups.map((group) => ({
        type: group.type,
        severity: group.severity,
        count: group._count._all,
      })),
      disclosure:
        'Counts come from saved Noxtill crawl records. They do not include raw page text, exact affected URLs, Search Console index confirmation or evidence that an issue caused a traffic change. A partial crawl may not cover every site page.',
    };
  }

  private async competitorEvidenceSummary(businessId: string) {
    const db = this.tenantPrisma.client;
    const [competitorCount, evidenceGroups, latestEvidence] = await Promise.all([
      db.competitor.count({ where: { businessId } }),
      db.seoCompetitorGap.groupBy({
        by: ['kind', 'status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: [{ kind: 'asc' }, { status: 'asc' }],
      }),
      db.seoCompetitorGap.findFirst({
        where: { businessId },
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
        select: { observedAt: true },
      }),
    ]);
    return {
      source: 'team_entered_competitor_seo_records',
      trackedCompetitorCount: competitorCount,
      evidenceGroups: evidenceGroups.map((group) => ({
        evidenceType: group.kind,
        status: group.status,
        count: group._count._all,
      })),
      latestObservationAt: latestEvidence?.observedAt.toISOString() ?? null,
      disclosure:
        'Competitor observations are entered by the business team and are not automatically discovered or verified. The summary excludes notes and URLs. Competitor authority, backlink totals, traffic and keyword coverage are not available from this source.',
    };
  }

  private async merchantOffPageEvidence(businessId: string) {
    const [
      linkStatuses,
      openOpportunityStages,
      publicationStatuses,
      pitchStages,
    ] = await Promise.all([
      this.tenantPrisma.client.seoOffPageLink.groupBy({
        by: ['status'],
        where: { businessId, tracked: true },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.seoOffPageOpportunity.groupBy({
        by: ['pipeline', 'stage'],
        where: { businessId, tracked: true, status: 'open' },
        _count: { _all: true },
        orderBy: [{ pipeline: 'asc' }, { stage: 'asc' }],
      }),
      this.tenantPrisma.client.seoGuestPublication.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.seoGuestPitch.groupBy({
        by: ['stage'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { stage: 'asc' },
      }),
    ]);
    const linkCount = (status: string) =>
      linkStatuses.find((row) => row.status === status)?._count._all ?? 0;
    return {
      source: 'merchant_entered_records' as const,
      trackedLinks: linkStatuses.reduce(
        (total, row) => total + row._count._all,
        0,
      ),
      activeLinks: linkCount('active'),
      lostLinks: linkCount('lost'),
      unverifiedLinks: linkCount('unverified'),
      openTrackedOpportunities: openOpportunityStages.reduce(
        (total, row) => total + row._count._all,
        0,
      ),
      openOpportunitiesByPipelineStage: openOpportunityStages.map((row) => ({
        pipeline: row.pipeline,
        stage: row.stage,
        count: row._count._all,
      })),
      guestPublications: publicationStatuses.reduce(
        (total, row) => total + row._count._all,
        0,
      ),
      guestPublicationStatuses: Object.fromEntries(
        publicationStatuses.map((row) => [row.status, row._count._all]),
      ),
      guestPitches: pitchStages.reduce(
        (total, row) => total + row._count._all,
        0,
      ),
      guestPitchStages: Object.fromEntries(
        pitchStages.map((row) => [row.stage, row._count._all]),
      ),
    };
  }

  private async rankHistoryEvidence(
    businessId: string,
  ): Promise<SeoRankHistoryEvidence> {
    const [trackedKeywordCount, keywords] = await Promise.all([
      this.tenantPrisma.client.trackedKeyword.count({ where: { businessId } }),
      this.tenantPrisma.client.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: {
          keyword: true,
          intent: true,
          targetPageUrl: true,
          snapshots: {
            orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
            take: 2,
            select: {
              rank: true,
              searchInterest: true,
              capturedAt: true,
            },
          },
        },
      }),
    ]);
    const staleBefore = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const observations = keywords.map((keyword) => {
      const latest = keyword.snapshots[0] ?? null;
      const previous = keyword.snapshots[1] ?? null;
      const comparable = latest?.rank != null && previous?.rank != null;
      const movement = !comparable
        ? 'not_comparable'
        : latest.rank! < previous.rank!
          ? 'improving'
          : latest.rank! > previous.rank!
            ? 'declining'
            : 'unchanged';
      return {
        keyword: keyword.keyword,
        intent: keyword.intent,
        targetPageUrl: keyword.targetPageUrl,
        latestRank: latest?.rank ?? null,
        latestStatus: latest
          ? latest.rank === null
            ? 'not_in_results'
            : 'ranked'
          : 'not_checked',
        previousRank: previous?.rank ?? null,
        movement,
        searchInterestIndex: latest?.searchInterest ?? null,
        capturedAt: latest?.capturedAt.toISOString() ?? null,
        freshness: latest
          ? latest.capturedAt.getTime() < staleBefore
            ? 'stale'
            : 'fresh'
          : 'missing',
      } as const;
    });
    const comparable = observations.filter(
      (item) => item.movement !== 'not_comparable',
    );
    const captureTimes = observations
      .map((item) => item.capturedAt)
      .filter((value): value is string => value !== null)
      .sort();
    return {
      source: 'tracked_keyword_rank_snapshots',
      trackedKeywordCount,
      keywordsWithSnapshots: observations.filter((item) => item.capturedAt).length,
      staleKeywordCount: observations.filter((item) => item.freshness === 'stale').length,
      improving: comparable.filter((item) => item.movement === 'improving').length,
      declining: comparable.filter((item) => item.movement === 'declining').length,
      unchanged: comparable.filter((item) => item.movement === 'unchanged').length,
      notComparable: observations.filter((item) => item.movement === 'not_comparable').length,
      latestCapturedAt: captureTimes.at(-1) ?? null,
      observations,
      truncated: trackedKeywordCount > keywords.length,
    };
  }

  private resourceType(kind: WorkspaceItem['kind']) {
    switch (kind) {
      case 'audit_finding':
        return 'seo_audit_issue';
      case 'page_revision':
        return 'seo_content_revision';
      case 'technical_change':
        return 'seo_technical_action';
      case 'content':
        return 'seo_content_brief';
    }
  }

  private async summarize(
    businessId: string,
    snapshot: Prisma.InputJsonObject,
    specialistAgentRunId: string,
    question?: string | null,
    sourceModuleKeys: readonly string[] = ['marketing'],
  ): Promise<AiSummary> {
    try {
      const questionMode = Boolean(question);
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        businessId,
        sourceModuleKeys,
      );
      const response = await this.aiInfra.createMessage(
        businessId,
        'seo_agent',
        {
          system: `You are a read-only SEO workspace assistant. Explain only the supplied saved rank snapshots, queue counts, property-level Google Search Console metrics, GA4 Organic Search aggregates and landing pages, grouped crawl findings, applied-action observations, settings status, competitor evidence and team-entered off-page records. Treat rank movement as observed, not caused by an SEO action. Treat Google Trends search interest as a relative 0–100 index, not monthly search volume. Treat off-page and competitor records as merchant-entered only; do not call them provider-verified backlinks or authority metrics. Never infer missing ranks, traffic, search volume, backlink authority, causes or expected impact from other values. Do not invent website findings or claim a fix was applied. ${questionMode ? 'Answer the supplied question only from this saved evidence. If it is unsupported, state that clearly and identify the missing source. Return exactly these five markdown headings, each on its own line and in this order: "## Answer", "## Evidence", "## Calculation", "## Assumptions and gaps", and "## Confidence". Under Evidence, name the snapshot fields and canonical SEO screens. Confidence describes evidence coverage and is not a calibrated probability. Keep the answer concise for human review.' : 'Keep the explanation concise for human review.'} ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: questionMode
                ? `${specialistAgentUntrustedData('SEO user question', question)}\nAnswer using this saved review evidence only. ${specialistAgentUntrustedData('SEO workspace snapshot', snapshot)}`
                : `Explain this aggregate SEO workspace snapshot only. ${specialistAgentUntrustedData('SEO workspace snapshot', snapshot)}`,
            },
          ],
          temperature: 0,
          maxTokens: questionMode ? 800 : 420,
        },
        SEO_AGENT_TOOLS.map(({ key }) => ({
          tool: key,
          source: 'registered_read_only_seo_evidence',
        })),
        undefined,
        specialistAgentRunId,
      );
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        businessId,
        sourceModuleKeys,
      );
      const candidateText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      const hasQuestionSections =
        hasRequiredSpecialistAgentAnswerSections(candidateText);
      const text = (questionMode && !hasQuestionSections
        ? ''
        : candidateText.slice(0, questionMode ? 5_000 : 1_400));
      return {
        mode: questionMode ? 'question' : 'review',
        status: text ? 'ready' : 'unavailable',
        text: text || null,
        message: text
          ? null
          : questionMode && candidateText
            ? 'The AI response did not include the required Answer, Evidence, Calculation, Assumptions and gaps, and Confidence sections.'
            : 'The AI provider returned no explanation.',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      };
    } catch (error) {
      if (isSpecialistSourceModuleDisabledError(error)) throw error;
      return {
        ...describeAiSummaryProviderFailure(
          error,
          'The real SEO workspace queue is still available.',
        ),
        mode: question ? 'question' : 'review',
      };
    }
  }
}
