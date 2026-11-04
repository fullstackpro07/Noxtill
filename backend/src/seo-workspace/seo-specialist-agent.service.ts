import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiSummaryProviderFailure } from '../ai/ai-provider-error.util';
import { AppException } from '../common/filters/app.exception';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  SpecialistAgentToolGatewayService,
  type RegisteredSpecialistAgentTool,
} from '../common/agents/specialist-agent-tool-gateway.service';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunTerminalEvent,
} from '../common/agents/specialist-agent-run-events.util';
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

const AGENT_KEY = 'seo_autopilot';
const AGENT_VERSION = '1.0.0';
const SEO_WORKSPACE_TOOL = 'get_seo_workspace_review';
const SEO_SEARCH_CONSOLE_TOOL = 'get_search_console_performance';
const SEO_ANALYTICS_TOOL = 'get_organic_search_attribution';
const SEO_OFF_PAGE_TOOL = 'get_merchant_off_page_summary';

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

type SeoSearchPerformanceEvidence = {
  status: IntegrationStatus;
  propertyUrl: string | null;
  windowDays: number;
  snapshots: Array<{
    startDate: string;
    endDate: string;
    clicks: string | null;
    impressions: string | null;
    clickThroughRate: number | null;
    averagePosition: number | null;
    dataState: string;
    fetchedAt: string;
  }>;
  trackedKeywordSummary: {
    trackedKeywordCount: number;
    latestWindowEnd: string | null;
    matchedKeywordCount: number;
    notReportedKeywordCount: number;
    observations: Array<{
      keyword: string;
      startDate: string;
      endDate: string;
      clicks: string | null;
      impressions: string | null;
      clickThroughRate: number | null;
      averagePosition: number | null;
      dataState: string;
      fetchedAt: string;
    }>;
    observationsTruncated: boolean;
  };
};
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
type SeoAnalyticsEvidence = Awaited<
  ReturnType<SeoAnalyticsAttributionService['agentEvidence']>
>;

/*
 * The gateway serializes outputs to bounded JSON. Dates in the queue projection are therefore
 * ISO strings and are restored to Date only after the result has crossed that boundary.
 */

type AiSummary = {
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
    private readonly toolGateway: SpecialistAgentToolGatewayService,
  ) {
    this.toolGateway.registerAgentTools(
      AGENT_KEY,
      '28',
      SEO_AGENT_TOOLS,
      async (context, tool) => {
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
              output: await this.searchPerformanceEvidence(context.businessId),
              status: 'succeeded',
              summary: 'Read saved Search Console performance evidence.',
              outputResourceType: 'SeoSearchConsoleEvidence',
            };
          case SEO_ANALYTICS_TOOL:
            return {
              output: await this.analyticsAttribution.agentEvidence(
                context.businessId,
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

  listRuns() {
    return this.tenantPrisma.client.specialistAgentRun.findMany({
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
  }

  async run(
    businessId: string,
    actorUserId: string | null,
    idempotencyKey?: string,
    options: SpecialistAgentRunOptions = {},
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'seo');
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
        {
          source: 'Google Analytics Data API',
          scope: 'selected_property_aggregate_Organic_Search_channel',
          containsExternalProviderMetrics: true,
        },
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
      { businessId },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenantPrisma.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    const run = reservation.run;
    if (reservation.reused) {
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: { id: run.id, businessId, agentKey: AGENT_KEY },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    try {
      const observedAt = new Date();
      const [
        queueEvidence,
        searchPerformance,
        analyticsAttribution,
        offPageRecords,
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
      const searchContext = searchPerformance.snapshots.length
        ? ` Search Console has real property-level data for ${searchPerformance.snapshots[0].startDate} to ${searchPerformance.snapshots[0].endDate}: ${searchPerformance.snapshots[0].clicks ?? 'clicks unavailable'} clicks and ${searchPerformance.snapshots[0].impressions ?? 'impressions unavailable'} impressions. This does not prove the cause of any change.`
        : ' Search performance is not available in this review because Search Console is not connected, has no selected property, or has not been synced.';
      const keywordSearchContext = searchPerformance.trackedKeywordSummary
        .latestWindowEnd
        ? ` The latest Search Console keyword window ends ${searchPerformance.trackedKeywordSummary.latestWindowEnd}; Google reported ${searchPerformance.trackedKeywordSummary.matchedKeywordCount} tracked term(s) and did not return ${searchPerformance.trackedKeywordSummary.notReportedKeywordCount}. Not returned is not treated as zero.`
        : ' Tracked-keyword Search Console observations are not available yet.';
      const offPageContext = ` Team-entered off-page records: ${offPageRecords.trackedLinks} tracked links (${offPageRecords.activeLinks} active, ${offPageRecords.lostLinks} marked lost, ${offPageRecords.unverifiedLinks} unverified), ${offPageRecords.openTrackedOpportunities} tracked open opportunities, ${offPageRecords.guestPublications} publications, and ${offPageRecords.guestPitches} pitches. These records are not provider-verified backlink coverage or authority metrics.`;
      const organicWindow = analyticsAttribution.current;
      const landingPages = organicWindow?.landingPages;
      const landingPageContext =
        landingPages?.dataState === 'returned'
          ? ` GA4 also returned Organic Search landing-page paths with sessions, key events and property-reported revenue; the saved page rows are included as source evidence. They do not establish page quality or SEO causality.`
          : landingPages?.dataState === 'no_data_returned'
            ? ' Google Analytics returned no Organic Search landing-page rows for the current period.'
            : ' Page-level GA4 data is not available in the latest saved snapshot.';
      const analyticsContext = organicWindow
        ? ` Google Analytics reports ${organicWindow.sessions ?? 'sessions unavailable'} Organic Search sessions, ${organicWindow.keyEvents ?? 'key events unavailable'} key events, and ${organicWindow.totalRevenue === null ? 'revenue unavailable' : `${analyticsAttribution.currencyCode ?? 'property currency unavailable'} ${organicWindow.totalRevenue}`} for ${organicWindow.startDate} to ${organicWindow.endDate}; the prior ${analyticsAttribution.windowDays}-day comparison is stored separately. GA4 channel attribution is descriptive and does not show that SEO work caused the result.${landingPageContext}`
        : ` Google Analytics attribution is unavailable: ${analyticsAttribution.unavailableReason ?? 'the latest saved Organic Search snapshot is not available'}`;
      const summary = candidate
        ? `The existing SEO Workspace has ${queue.kpis.waitingApproval} item(s) waiting approval and ${queue.kpis.verificationRequired} requiring verification. Review ${candidate.action} (${candidate.kind.replaceAll('_', ' ')}, ${candidate.stage}, ${candidate.risk} risk) in its canonical screen. This is a queue triage, not a calibrated impact score.${searchContext}${keywordSearchContext}${analyticsContext}${offPageContext}`
        : `The existing SEO Workspace currently has no open findings or in-progress changes in its configured windows.${searchContext}${keywordSearchContext}${analyticsContext}${offPageContext}`;
      const assumptions = [
        'Queue counts and item status are read from the existing SEO Workspace service; this run does not recreate its lifecycle or approve any action.',
        'The suggested review order is a deterministic stage order (approval, verification mismatch, verification, new finding, ready to apply, draft); it is not a calibrated business-impact score.',
        'Off-page counts come only from tracked merchant-entered Noxtill records and do not represent an external backlink index or authority score.',
        'Google Analytics values use the selected property and its Organic Search session channel group. Key events and total revenue follow that property’s GA4 attribution settings; period comparisons do not establish that SEO actions caused an outcome.',
      ];
      const missingData = [
        ...(searchPerformance.snapshots.length
          ? []
          : [
              'Search Console performance is not available in this review, so clicks and impressions are not estimated.',
            ]),
        ...(searchPerformance.trackedKeywordSummary.latestWindowEnd
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
        ...(analyticsAttribution.current
          ? []
          : [
              `Google Analytics Organic Search metrics are unavailable because ${analyticsAttribution.unavailableReason ?? 'no saved snapshot exists'}; these values are not estimated.`,
            ]),
        'Provider-wide backlink authority and search-volume figures are not available here; no rank or search outcome is inferred from queue state.',
        'No website changes, indexing requests or external outreach are performed by this read-only review.',
      ];
      const aiSummary =
        options.includeAiSummary === false
          ? null
          : await this.summarize(businessId, snapshot, run.id);
      const finishedAt = new Date();
      const output = {
        source: 'SeoAgentWorkspaceService.queue',
        snapshot,
        summary,
        aiSummary,
        coverage:
          'workspace_queue_search_console_google_analytics_and_merchant_entered_off_page_records',
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

  private async searchPerformanceEvidence(businessId: string) {
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
  ): Promise<AiSummary> {
    try {
      const response = await this.aiInfra.createMessage(
        businessId,
        'seo_agent',
        {
          system: `You are a read-only SEO workspace assistant. Explain the supplied queue counts, property-level Google Search Console metrics, and team-entered off-page record counts exactly as reported. Treat off-page records as merchant-entered only; do not call them provider-verified backlinks or authority metrics. Do not infer keyword rankings, traffic, search volume, backlink authority, causes or expected impact from these values. Do not invent website findings or claim a fix was applied. Keep the explanation concise for human review. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: `Explain this aggregate SEO workspace snapshot only. ${specialistAgentUntrustedData('SEO workspace snapshot', snapshot)}`,
            },
          ],
          temperature: 0,
          maxTokens: 220,
        },
        [
          {
            tool: 'read_seo_workspace_queue',
            source: 'SeoAgentWorkspaceService.queue',
          },
        ],
        undefined,
        specialistAgentRunId,
      );
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
        .slice(0, 1400);
      return {
        status: text ? 'ready' : 'unavailable',
        text: text || null,
        message: text ? null : 'The AI provider returned no explanation.',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      };
    } catch (error) {
      return describeAiSummaryProviderFailure(
        error,
        'The real SEO workspace queue is still available.',
      );
    }
  }
}
