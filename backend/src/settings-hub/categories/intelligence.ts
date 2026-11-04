import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { IntegrationProvider } from '@prisma/client';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import {
  CategoryDef,
  HubValue,
  row,
  RowDef,
  plural,
  relativeTime,
} from '../hub.core';
import {
  HubDeps,
  asJson,
  business,
  monthStart,
  updateBusiness,
} from './hub.deps';
import { NumberPolicyRow, policyRow } from './policy-rows';
import { assertAutomationGovernance } from '../../marketing/automations/automation-governance.util';
import {
  workflowGraphActions,
  type WorkflowGraph,
} from '../../marketing/automations/workflow-graph.util';
import { BI_OVERVIEW_WIDGETS } from '../../business-intelligence/business-intelligence.constants';
import { WIDGET_REGISTRY } from '../../widgets/widget-registry';
import { WIDGET_CACHE_TTL_MS } from '../../widgets/widgets.constants';
import { estimateHaikuCostUsd } from '../../ai/ai-infra.constants';

const bad = (message: string) =>
  new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);
const formatMonthlyRequests = (value: number) =>
  `${value.toLocaleString('en-US')} request${value === 1 ? '' : 's'} / month`;
const SPECIALIST_TOOL_CALL_OVERRIDES = [
  {
    key: 'inventory',
    policy: 'agents.inventoryMaxToolCallsPerRun',
    label: 'Inventory',
  },
  {
    key: 'finance',
    policy: 'agents.financeMaxToolCallsPerRun',
    label: 'Finance',
  },
  {
    key: 'customer',
    policy: 'agents.customerMaxToolCallsPerRun',
    label: 'Customer',
  },
  { key: 'seo', policy: 'agents.seoMaxToolCallsPerRun', label: 'SEO' },
  {
    key: 'commerce',
    policy: 'agents.commerceMaxToolCallsPerRun',
    label: 'Commerce',
  },
] as const;

const AI_FEATURES: { key: string; label: string; description: string }[] = [
  {
    key: 'assistant',
    label: 'Business assistant',
    description: 'The chat assistant that answers questions from your data.',
  },
  {
    key: 'insights',
    label: 'AI insights',
    description: 'Suggestions shown on the dashboard and Business Brain.',
  },
  {
    key: 'whatIf',
    label: 'What-if simulations',
    description: 'Scenario estimates built from your recorded data.',
  },
  {
    key: 'reviewReplies',
    label: 'Review reply drafts',
    description: 'Drafts a reply to a review for a person to send.',
  },
  {
    key: 'campaignCopy',
    label: 'Campaign copy',
    description: 'Drafts marketing message copy for a person to approve.',
  },
  {
    key: 'voiceEntry',
    label: 'Voice entry',
    description:
      'Turns a spoken command into a draft you confirm before anything is saved.',
  },
  {
    key: 'photoDigitizer',
    label: 'Photo digitizer',
    description:
      'Reads a photo of a list into rows you review before importing.',
  },
  {
    key: 'workflowAgents',
    label: 'Workflow AI drafts & agents',
    description:
      'AI-draft and read-only AI agent workflow steps. Their output appears in run history and is not sent automatically.',
  },
  {
    key: 'inventoryAgent',
    label: 'Inventory Intelligence Agent',
    description:
      'Allows the Inventory agent to send stock and sales-velocity evidence to the configured AI provider for a review-only explanation.',
  },
  {
    key: 'financeAgent',
    label: 'Financial Intelligence Agent',
    description:
      'Allows the Financial Intelligence Agent to send the selected Profit & Analytics summary to the configured AI provider for a review-only explanation.',
  },
  {
    key: 'customerAgent',
    label: 'Customer Intelligence Agent',
    description:
      'Allows the Customer Intelligence Agent to send anonymized customer counts and retention aggregates to the configured AI provider for a review-only explanation. Names, contact details and message content are excluded.',
  },
  {
    key: 'seoAgent',
    label: 'SEO Autopilot Agent',
    description:
      'Allows an optional AI explanation of aggregate counts from the existing SEO Agent Workspace. Page URLs, provider credentials and site content are not sent by this review.',
  },
  {
    key: 'commerceAgent',
    label: 'Autonomous Commerce Agent',
    description:
      'Allows an optional AI explanation of aggregate commerce review evidence. Canonical product, order, inventory and provider writes remain with their owning modules and are not performed by this review.',
  },
];

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email',
  gmb: 'Google Business Profile',
  google_ads: 'Google Ads',
  google_analytics: 'Google Analytics 4',
  google_search_console: 'Google Search Console',
  merchant: 'Google Merchant Center',
  meta_ads: 'Meta Ads',
  tiktok_ads: 'TikTok Ads',
  bing_places: 'Bing Places',
  apple_business_connect: 'Apple Business Connect',
  yelp: 'Yelp',
  linkedin_ads: 'LinkedIn Ads',
  pinterest_ads: 'Pinterest Ads',
  snapchat_ads: 'Snapchat Ads',
  microsoft_ads: 'Microsoft Ads',
  amazon_ads: 'Amazon Ads',
  reddit_ads: 'Reddit Ads',
  quickbooks: 'QuickBooks',
  xero: 'Xero',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  zapier: 'Zapier',
  make: 'Make',
  n8n: 'n8n',
  developer: 'Developer API',
};

export function intelligenceCategories(d: HubDeps): CategoryDef[] {
  const specialistRequestLimitRow = (
    agentKey: string,
    spec: NumberPolicyRow,
  ): RowDef => {
    const definition = policyRow(d, spec);
    return {
      ...definition,
      state: async (ctx) => {
        const [state, counted] = await Promise.all([
          definition.state(ctx),
          d.prisma.specialistAgentAiRequest.count({
            where: {
              businessId: ctx.businessId,
              agentKey,
              createdAt: { gte: monthStart(ctx.now) },
            },
          }),
        ]);
        return {
          ...state,
          value: `${state.value} · ${counted.toLocaleString('en-US')} counted this month`,
        };
      },
    };
  };

  const specialistMonthlySpend = async (
    businessId: string,
    agentKey: string,
    kind: string,
    now: Date,
  ): Promise<number> => {
    const since = monthStart(now);
    const [logged, outstanding] = await Promise.all([
      d.prisma.aiCallLog.aggregate({
        where: { businessId, kind, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      d.prisma.specialistAgentAiRequest.aggregate({
        where: {
          businessId,
          agentKey,
          createdAt: { gte: since },
          state: { in: ['reserved', 'provider_failed'] },
        },
        _sum: { reservedCostUsd: true },
      }),
    ]);
    return (
      estimateHaikuCostUsd(
        Number(logged._sum.inputTokens ?? 0),
        Number(logged._sum.outputTokens ?? 0),
      ) + Number(outstanding._sum.reservedCostUsd ?? 0)
    );
  };

  const specialistSpendLimitRow = (
    agentKey: string,
    kind: string,
    spec: NumberPolicyRow,
  ): RowDef => {
    const definition = policyRow(d, spec);
    return {
      ...definition,
      state: async (ctx) => {
        const [state, estimatedSpend] = await Promise.all([
          definition.state(ctx),
          specialistMonthlySpend(ctx.businessId, agentKey, kind, ctx.now),
        ]);
        return {
          ...state,
          value: `${state.value} · $${estimatedSpend.toFixed(4)} logged + reserved this month`,
        };
      },
    };
  };

  const aiFeatureRow = (f: (typeof AI_FEATURES)[number]): RowDef =>
    row({
      key: `ai-feature:${f.key}`,
      label: f.label,
      description: f.description,
      risk: 'Medium',
      requires: CAPABILITIES.AI_SETTINGS_MANAGE,
      reset: { label: 'On', value: true },
      state: async (ctx) => {
        const b = await business(d, ctx);
        const on =
          ((b.aiFeatureToggles ?? {}) as Record<string, boolean>)[f.key] !==
          false;
        return {
          value: on ? 'On' : 'Off',
          tone: on ? 'green' : 'neutral',
          control: { type: 'toggle', on },
        };
      },
      write: async (ctx, v: HubValue) => {
        const b = await business(d, ctx);
        const next = {
          ...((b.aiFeatureToggles ?? {}) as Record<string, boolean>),
          [f.key]: Boolean(v),
        };
        await updateBusiness(d, ctx, { aiFeatureToggles: asJson(next) });
      },
    });

  return [
    {
      key: 'business-intelligence',
      label: 'Intelligence Settings',
      title: 'Intelligence Settings',
      icon: 'brain',
      group: 'Intelligence',
      description:
        'Set on-screen confidence and impact thresholds and optional starting assumptions for BI simulations.',
      affects: ['BI Overview', 'Opportunity Radar', 'Business Simulator'],
      affectsNote:
        'Thresholds label source records; simulation defaults prefill hypothetical inputs only. Nothing here edits source business records or sends alerts.',
      help: [
        'BI reads the canonical Dashboard widget registry. These settings do not redefine metric formulas.',
        'Confidence values are source-recorded Product Radar values, not calibrated probabilities. Thresholds add labels only and do not change ranking.',
        'Impact thresholds add an on-screen marker to recorded insight amounts; BI threshold notifications are not available.',
        'Simulation defaults prefill assumptions for review. Saving a scenario never writes to live products, prices, staff or campaigns.',
        'AI provider setup and feature permissions stay in AI & Governance; BI does not store provider credentials or override those controls.',
      ],
      notice: {
        text: 'Metric definitions remain owned by their source modules. BI thresholds are guidance markers, not causal claims or automated actions.',
        icon: 'shield-check',
      },
      actions: [
        {
          label: 'Open BI Overview',
          icon: 'external-link',
          href: '/business-intelligence',
          kind: 'link',
        },
        {
          label: 'Open AI & Governance',
          icon: 'external-link',
          href: '/settings/ai',
          kind: 'link',
        },
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Canonical sources',
          hint: 'Read-only references',
          rows: [
            row({
              key: 'bi-ai-governance',
              label: 'AI models and permissions',
              description:
                'Provider configuration, monthly limits and AI feature access remain in the existing AI & Governance controls. BI has no separate per-business model allowlist.',
              link: { label: 'Open AI settings', href: '/settings/ai' },
              state: () => ({ value: 'Managed in AI & Governance' }),
            }),
            row({
              key: 'bi-approval-policy',
              label: 'Approval policy',
              description:
                'BI does not execute source-module changes. Permissions and any required approvals are enforced by the owning module.',
              state: () => ({ value: 'Owned by source modules' }),
            }),
            row({
              key: 'bi-retention-policy',
              label: 'BI record retention',
              description:
                'A separate BI retention setting is not configured here. This view does not change how source records are retained.',
              state: () => ({ value: 'No BI-specific policy' }),
            }),
            row({
              key: 'bi-freshness-policy',
              label: 'Dashboard metric freshness',
              description:
                'The BI Overview uses the Dashboard widget cache. This freshness interval is set by the Dashboard service, not configurable here.',
              state: () => ({
                value: `Dashboard cache · ${WIDGET_CACHE_TTL_MS / 1000} seconds`,
              }),
            }),
            row({
              key: 'bi-notifications',
              label: 'Threshold notifications',
              description:
                'BI does not currently send notifications when a threshold is crossed. Thresholds are shown as on-screen markers only.',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
          ],
          dynamicRows: () => {
            const registered = new Set(
              WIDGET_REGISTRY.map((widget) => widget.key),
            );
            const unresolved = BI_OVERVIEW_WIDGETS.filter(
              (key) => !registered.has(key),
            );
            return Promise.resolve([
              row({
                key: 'bi-metric-registry',
                label: 'Metric definitions',
                description: `BI checks its Dashboard metric references against the canonical widget registry when this screen loads: ${BI_OVERVIEW_WIDGETS.join(', ')}. Formulas remain owned by Dashboard.`,
                link: {
                  label: 'Open BI Overview',
                  href: '/business-intelligence',
                },
                state: () =>
                  unresolved.length
                    ? {
                        value: `Unresolved: ${unresolved.join(', ')}`,
                        tone: 'red',
                      }
                    : {
                        value: 'All BI references resolve',
                        tone: 'green',
                      },
              }),
            ]);
          },
        },
        {
          title: 'Confidence and impact markers',
          hint: 'Labels only · no ranking or notification changes',
          rows: [
            policyRow(d, {
              key: 'bi-confidence-review-below',
              policy: 'bi.confidenceReviewBelow',
              kind: 'number',
              label: 'Flag source confidence below',
              description:
                'Adds a review label to Product Radar candidates below this recorded confidence score (0–100). Empty means no review threshold.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n} / 100`,
              emptyLabel: 'No threshold',
            }),
            policyRow(d, {
              key: 'bi-confidence-high-at',
              policy: 'bi.confidenceHighAtOrAbove',
              kind: 'number',
              label: 'Mark source confidence high at',
              description:
                'Adds a high-confidence label at or above this recorded Product Radar score (0–100). Empty means no high-confidence threshold.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n} / 100`,
              emptyLabel: 'No threshold',
            }),
            policyRow(d, {
              key: 'bi-impact-alert-threshold',
              policy: 'bi.insightImpactAlertThreshold',
              kind: 'number',
              label: 'Insight impact alert threshold',
              description:
                'Marks recorded AI Insight impact at or above this amount in the business currency. This is an on-screen marker only; no notification is sent.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n.toLocaleString('en-US')} (business currency)`,
              emptyLabel: 'No threshold',
              step: 0.01,
            }),
          ],
        },
        {
          title: 'Simulation defaults',
          hint: 'Optional starting assumptions · never applied live',
          footer:
            'These values prefill a new what-if form. Review them before saving; scenarios do not alter operational records.',
          rows: [
            policyRow(d, {
              key: 'bi-simulation-price-default',
              policy: 'bi.simulationPriceChangePercent',
              kind: 'number',
              label: 'Default hypothetical price change',
              description:
                'Prefills the price-change assumption for a new scenario. Empty leaves the input blank.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n}%`,
              emptyLabel: 'No default',
              step: 0.01,
            }),
            policyRow(d, {
              key: 'bi-simulation-stock-default',
              policy: 'bi.simulationAdditionalStockUnits',
              kind: 'number',
              label: 'Default additional stock units',
              description:
                'Prefills the hypothetical additional units input. Empty leaves the input blank.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n} units`,
              emptyLabel: 'No default',
            }),
            policyRow(d, {
              key: 'bi-simulation-staff-default',
              policy: 'bi.simulationStaffCountChange',
              kind: 'number',
              label: 'Default staff-size change',
              description:
                'Prefills the hypothetical headcount change. Empty leaves the input blank.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n > 0 ? '+' : ''}${n} people`,
              emptyLabel: 'No default',
            }),
            policyRow(d, {
              key: 'bi-simulation-marketing-default',
              policy: 'bi.simulationMarketingBudgetChange',
              kind: 'number',
              label: 'Default marketing budget change',
              description:
                'Prefills a hypothetical amount in the business currency. Empty leaves the input blank; no marketing ROI is estimated.',
              requires: CAPABILITIES.PROFIT_VIEW,
              risk: 'Low',
              format: (n) => `${n.toLocaleString('en-US')} (business currency)`,
              emptyLabel: 'No default',
              step: 0.01,
            }),
          ],
        },
      ],
    },
    {
      key: 'automations',
      label: 'Automations',
      title: 'Automations',
      icon: 'workflow',
      group: 'Intelligence',
      description:
        'Your workflows, whether they are running, and what happened when they last ran.',
      affects: ['Bookings', 'Credit', 'Marketing', 'Reviews', 'Inventory'],
      affectsNote:
        'Turning a workflow off stops it firing for new events; past runs are kept.',
      help: [
        'A failed run is recorded with its reason. You can manually retry eligible failed actions within the retry limit.',
        'Workflows can run from matching events or from a configured schedule. Durable waits and schedule recovery require Redis.',
        'Workflow actions can message customers, update customer tags and fields, wait, request approval, and create AI drafts saved to run history.',
      ],
      actions: [
        {
          label: 'Open Automations',
          icon: 'external-link',
          href: '/marketing/automations',
          kind: 'link',
        },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Health',
          hint: 'Failures are kept, not hidden',
          rows: [
            row({
              key: 'wf-summary',
              label: 'Workflows',
              description: 'Workflows that are on and off.',
              state: async (ctx) => {
                const [on, off] = await Promise.all([
                  d.prisma.workflow.count({
                    where: { businessId: ctx.businessId, active: true },
                  }),
                  d.prisma.workflow.count({
                    where: { businessId: ctx.businessId, active: false },
                  }),
                ]);
                return { value: `${on} on · ${off} off` };
              },
            }),
            row({
              key: 'wf-failed',
              label: 'Failed in the last 24 hours',
              description:
                'Runs that failed, with the reason recorded on each run.',
              state: async (ctx) => {
                const n = await d.prisma.workflowRun.count({
                  where: {
                    workflow: { businessId: ctx.businessId },
                    status: 'failed',
                    createdAt: {
                      gte: new Date(ctx.now.getTime() - 86_400_000),
                    },
                  },
                });
                return {
                  value: n ? `${n} failed` : 'None',
                  tone: n ? 'amber' : 'green',
                };
              },
            }),
            row({
              key: 'wf-last',
              label: 'Last run',
              description: 'The most recent run of any workflow.',
              state: async (ctx) => {
                const r = await d.prisma.workflowRun.findFirst({
                  where: { workflow: { businessId: ctx.businessId } },
                  orderBy: { createdAt: 'desc' },
                });
                return {
                  value: r
                    ? `${relativeTime(r.createdAt, ctx.now)} · ${r.status}`
                    : 'Never run',
                };
              },
            }),
          ],
        },
        {
          title: 'Your workflows',
          hint: 'On or off',
          dynamicRows: async (ctx) => {
            const wfs = await d.prisma.workflow.findMany({
              where: { businessId: ctx.businessId },
              orderBy: { createdAt: 'asc' },
            });
            if (wfs.length === 0)
              return [
                row({
                  key: 'wf-none',
                  label: 'Workflows',
                  description: 'No workflow has been created yet.',
                  link: {
                    label: 'Create a workflow',
                    href: '/marketing/automations',
                  },
                  state: () => ({ value: 'None', tone: 'neutral' }),
                }),
              ];
            return wfs.map((w): RowDef =>
              row({
                key: `workflow:${w.id}`,
                label: w.name,
                description: `Runs when: ${w.triggerKey.replace(/_/g, ' ')}.`,
                risk: 'Medium',
                requires: CAPABILITIES.AUTOMATIONS_MANAGE,
                link: {
                  label: 'Edit workflow',
                  href: '/marketing/automations',
                },
                state: () => ({
                  value: w.active ? 'On' : 'Off',
                  tone: w.active ? 'green' : 'neutral',
                  control: { type: 'toggle', on: w.active },
                }),
                write: async (ctx, v) => {
                  const on = Boolean(v);
                  if (on && !w.active) {
                    const graph =
                      (w.graph as unknown as WorkflowGraph | null) ?? null;
                    const steps = graph
                      ? workflowGraphActions(graph)
                      : (w.actions as unknown as { type: string }[]);
                    await assertAutomationGovernance(d.prisma, {
                      businessId: ctx.businessId,
                      workflowId: w.id,
                      activating: true,
                      activeAfter: true,
                      actions: steps,
                      graph,
                    });
                  }
                  await d.prisma.workflow.update({
                    where: { id: w.id },
                    data: { active: on },
                  });
                },
              }),
            );
          },
        },
        {
          title: 'Governance',
          hint: 'Enforced when a workflow is switched on or changed',
          rows: [
            policyRow(d, {
              key: 'wf-max-active',
              policy: 'automations.maxActiveWorkflows',
              kind: 'number',
              label: 'Maximum active workflows',
              description:
                'Switching on a workflow is refused once this many are active. Empty means no limit.',
              risk: 'Medium',
              requires: CAPABILITIES.AUTOMATIONS_MANAGE,
              format: (n) => `${n} active`,
              emptyLabel: 'No limit',
            }),
            policyRow(d, {
              key: 'wf-max-runs-month',
              policy: 'automations.maxRunsPerMonth',
              kind: 'number',
              label: 'Maximum workflow runs per month',
              description:
                'After this many workflow runs in a calendar month (UTC), later triggers are recorded as skipped. Skipped runs, such as conditions not met, do not count. Empty means no limit.',
              risk: 'Medium',
              requires: CAPABILITIES.AUTOMATIONS_MANAGE,
              format: (n) => `${n} runs per month`,
              emptyLabel: 'No limit',
            }),
            policyRow(d, {
              key: 'wf-run-retention-days',
              policy: 'automations.runRetentionDays',
              kind: 'number',
              label: 'Run-history retention',
              description:
                'Delete finished workflow runs older than this many days. Running, waiting, approval-pending and open Recovery runs are kept. Empty means keep forever.',
              risk: 'Medium',
              requires: CAPABILITIES.AUTOMATIONS_MANAGE,
              format: (n) => `${n} days`,
              emptyLabel: 'Keep forever',
            }),
            policyRow(d, {
              key: 'wf-approval-before-message',
              policy: 'automations.requireApprovalBeforeCustomerMessages',
              kind: 'toggle',
              label: 'Require approval before customer messages',
              description:
                'An active workflow must pass a "Request approval" step before any step that messages a customer.',
              risk: 'Medium',
              requires: CAPABILITIES.AUTOMATIONS_MANAGE,
              impact:
                'Turning on a workflow, or saving changes to an active workflow, is refused if a customer message can run without a prior approval step. Existing active workflows keep running until changed.',
              on: { text: 'Required', tone: 'blue' },
              off: { text: 'Not required', tone: 'neutral' },
            }),
          ],
        },
        {
          title: 'Autonomous Commerce',
          hint: 'Kill switch',
          rows: [
            policyRow(d, {
              key: 'commerce-paused',
              policy: 'commerce.actionsPaused',
              kind: 'toggle',
              label: 'Pause all commerce actions',
              description:
                'Stops Autonomous Commerce from sending listings to sales channels, generating AI listings and running subscription renewals (which create orders). Viewing, reviewing and manual record keeping keep working.',
              risk: 'Medium',
              requires: CAPABILITIES.COMMERCE_MANAGE,
              impact:
                'While paused, subscriptions that come due stay due — none are skipped or lost, and they can be renewed after you resume.',
              link: {
                label: 'Open Autonomous Commerce',
                href: '/autonomous-commerce/product-radar',
              },
              on: { text: 'Paused', tone: 'red' },
              off: { text: 'Running', tone: 'green' },
            }),
            policyRow(d, {
              key: 'commerce-autonomy',
              policy: 'commerce.autonomyLevel',
              kind: 'number',
              label: 'Commerce agent autonomy level',
              description:
                '0 disabled · 1 observe (read tools) · 2 recommend (drafts) · 3 approval-gated · 4 limited · 5 full configured autonomy. Medium-risk and higher tools always need approval.',
              risk: 'High',
              requires: CAPABILITIES.COMMERCE_MANAGE,
              impact:
                'Controls which registered commerce tools an agent may use. Higher levels never skip approval for high-risk, financial or irreversible actions.',
              link: {
                label: 'Open Agents & Tools',
                href: '/autonomous-commerce/agent-tools',
              },
              format: (n) => `Level ${n}`,
            }),
          ],
        },
        {
          title: 'Safety',
          hint: 'Fixed behaviour',
          rows: [
            row({
              key: 'wf-retry',
              label: 'Failed runs',
              description:
                'Eligible failed actions can be retried manually within a limit; actions are not retried automatically.',
              state: () => ({ value: 'Manual retry · limited' }),
            }),
            row({
              key: 'wf-actions',
              label: 'What a workflow can do',
              description:
                'The actions currently supported by the workflow engine.',
              state: () => ({
                value:
                  'Message · notify · tag · custom field · wait · approval · AI draft',
              }),
            }),
          ],
        },
      ],
    },
    {
      key: 'ai',
      label: 'AI & Governance',
      title: 'AI & Governance',
      icon: 'sparkles',
      group: 'Intelligence',
      description:
        'Which AI features are on, how much they may cost, and what AI is allowed to do.',
      affects: ['Every module', 'Marketing', 'Reviews'],
      affectsNote:
        'Turning a feature off blocks it for everyone in this business immediately.',
      help: [
        'Owner-only: AI switches and spend limits are billing-adjacent controls.',
        'The assistant’s data tools are read-only. It cannot change a price, refund, balance or permission.',
        'Voice commands only draft a record; nothing is saved until you confirm the draft.',
      ],
      notice: {
        text: 'AI cannot change prices, refunds, credit, stock or permissions: the assistant only reads, and voice commands are drafts you must confirm.',
        icon: 'shield-check',
      },
      actions: [
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
        {
          label: 'Open AI settings',
          icon: 'external-link',
          href: '/assistant/settings',
          kind: 'link',
        },
      ],
      groups: [
        {
          title: 'Voice usage limits',
          hint: 'Applied to every new inbound call',
          rows: [
            policyRow(d, {
              key: 'voice-max-inbound-calls-month',
              policy: 'voice.maxInboundCallsPerMonth',
              kind: 'number',
              label: 'Monthly automated inbound calls',
              description:
                'Counts inbound calls admitted to the automated receptionist in the UTC calendar month. Once reached, later calls are logged for follow-up and routed to a human when available; AI and IVR handling are skipped. Empty means no limit.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              impact:
                'When the cap is reached, callers will not enter the automated assistant or IVR. No caller audio is recorded on a capped call.',
              link: {
                label: 'Open Phone settings',
                href: '/receptionist/settings',
              },
              format: (n) => `${n.toLocaleString('en-US')} calls per month`,
              emptyLabel: 'No limit',
            }),
            policyRow(d, {
              key: 'voice-bookings-staff-approval',
              policy: 'voice.bookingsRequireStaffApproval',
              kind: 'toggle',
              label: 'Staff approval for phone bookings',
              description:
                'AI phone bookings stay requested until staff approves them. Required deposits or an unassigned service-specific staff member also need review, even with this switch off. AI never records an uncollected cash deposit.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              link: { label: 'Booking requests', href: '/bookings' },
              on: { text: 'Staff approval required', tone: 'amber' },
              off: { text: 'Confirm eligible bookings', tone: 'green' },
            }),
            policyRow(d, {
              key: 'voice-meeting-guest-limit',
              policy: 'voice.meetingGuestLimit',
              kind: 'number',
              label: 'Admitted guests per video meeting',
              description:
                'Limits personal invitations admitted by the assigned host. Waiting requests do not take a seat. This is an application seat limit, not a measured count of connected participants.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              format: (n) => `${n} admitted guests`,
              link: { label: 'Video Meetings', href: '/phone/meetings' },
            }),
            policyRow(d, {
              key: 'voice-monthly-spend-cap-usd',
              policy: 'voice.monthlySpendCapUsd',
              kind: 'number',
              label: 'Monthly phone spending cap (USD)',
              description:
                'Confirmed USD provider charges plus conservative realtime AI estimates. Sends in-app owner warnings at 70% and 90%. At the cap, new AI calls and outbound jobs are refused; active calls can reach the safe handoff path. Unpriced usage and other currencies are shown separately.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              format: (n) => `$${n.toFixed(2)} per UTC month`,
              emptyLabel: 'No phone spending cap',
              link: { label: 'Phone usage', href: '/receptionist/settings' },
            }),
            policyRow(d, {
              key: 'voice-hold-queue-max-wait',
              policy: 'voice.holdQueueMaxWaitSeconds',
              kind: 'number',
              label: 'Caller hold-queue wait limit',
              description:
                'When set, calls that request a person and cannot connect enter Twilio’s real hold queue. At this many seconds, the configured overflow action runs. Empty keeps the current immediate follow-up behavior.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              format: (n) => `${n} seconds`,
              emptyLabel: 'Hold queue off',
              link: {
                label: 'Open Phone settings',
                href: '/receptionist/settings',
              },
            }),
            policyRow(d, {
              key: 'voice-hold-queue-overflow-ai',
              policy: 'voice.holdQueueOverflowToAi',
              kind: 'toggle',
              label: 'Return callers to the AI at the wait limit',
              description:
                'If enabled, the caller returns to the pinned AI receptionist flow when the hold limit is reached. If disabled, the next enabled overflow option is used, or a callback follow-up.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              on: { text: 'AI overflow on', tone: 'blue' },
              off: { text: 'Off', tone: 'neutral' },
              link: {
                label: 'Open Phone settings',
                href: '/receptionist/settings',
              },
            }),
            policyRow(d, {
              key: 'voice-hold-queue-overflow-human',
              policy: 'voice.holdQueueOverflowToHuman',
              kind: 'toggle',
              label: 'Offer callers to another person at the wait limit',
              description:
                'If AI overflow is off, this offers the caller to the next available human. If no person is available or this is off, a callback follow-up is created.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              on: { text: 'Human overflow on', tone: 'green' },
              off: { text: 'Off', tone: 'neutral' },
              link: {
                label: 'Open Phone settings',
                href: '/receptionist/settings',
              },
            }),
            policyRow(d, {
              key: 'voice-missed-call-text-back',
              policy: 'voice.missedCallTextBack',
              kind: 'toggle',
              label: 'Text missed callers',
              description:
                'After a missed call, send the caller a short "sorry we missed you" message through your messaging channel. Numbers on the suppression list and customers who opted out are never texted.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              impact:
                'Callers who are not saved customers are texted too; check this fits your local messaging rules. Each send counts against the monthly message quota.',
              link: {
                label: 'Open Missed Calls',
                href: '/receptionist/missed-calls',
              },
              on: { text: 'Texting', tone: 'blue' },
              off: { text: 'Off', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'voice-redact-transcripts',
              policy: 'voice.redactTranscripts',
              kind: 'toggle',
              label: 'Redact call transcripts',
              description:
                'After a call ends, card numbers, ID numbers, phone numbers and email addresses in its transcript and AI summary are replaced with placeholders. Calls on legal hold are skipped.',
              risk: 'Medium',
              requires: CAPABILITIES.VOICE_MANAGE,
              impact:
                'Redaction is permanent for each processed call; the original words cannot be recovered. Live calls are never changed.',
              link: {
                label: 'Open Phone settings',
                href: '/receptionist/settings',
              },
              on: { text: 'Redacting', tone: 'blue' },
              off: { text: 'Off', tone: 'neutral' },
            }),
          ],
        },
        {
          title: 'AI status',
          hint: 'Honest about its limits',
          rows: [
            row({
              key: 'ai-available',
              label: 'Availability',
              description:
                'Whether an AI provider is configured on this Noxtill installation.',
              state: () => ({
                value: process.env.ANTHROPIC_API_KEY
                  ? 'Configured'
                  : 'Not configured',
                tone: process.env.ANTHROPIC_API_KEY ? 'green' : 'red',
              }),
            }),
            row({
              key: 'ai-usage',
              label: 'Usage this month',
              description: 'AI calls made and their estimated cost this month.',
              state: async (ctx) => {
                const agg = await d.prisma.aiCallLog.aggregate({
                  where: {
                    businessId: ctx.businessId,
                    createdAt: { gte: monthStart(ctx.now) },
                  },
                  _count: { _all: true },
                  _sum: { estimatedCostUsd: true },
                });
                return {
                  value: `${agg._count._all.toLocaleString('en-US')} calls · $${Number(agg._sum.estimatedCostUsd ?? 0).toFixed(2)}`,
                };
              },
            }),
            row({
              key: 'ai-cap',
              label: 'Monthly cost cap',
              description:
                'AI calls are refused once estimated spend this month reaches this amount.',
              risk: 'High',
              impact:
                'Lowering the cap can immediately block AI features for the rest of the month.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              reset: { label: '$5.00', value: 5 },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return {
                  value: `$${Number(b.aiMonthlyCostCapUsd).toFixed(2)}`,
                  control: {
                    type: 'number',
                    current: Number(b.aiMonthlyCostCapUsd),
                    min: 0,
                    max: 100000,
                    step: 0.5,
                    unit: 'USD',
                  },
                };
              },
              write: async (ctx, v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0)
                  throw bad('Enter a cost of 0 or more.');
                await updateBusiness(d, ctx, { aiMonthlyCostCapUsd: n });
              },
            }),
            row({
              key: 'ai-rate',
              label: 'Calls per minute',
              description:
                'The most AI calls this business can make in a minute.',
              risk: 'Medium',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              reset: { label: '10', value: 10 },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return {
                  value: String(b.aiRateLimitPerMinute),
                  control: {
                    type: 'number',
                    current: b.aiRateLimitPerMinute,
                    min: 1,
                    max: 1000,
                    step: 1,
                    unit: 'per minute',
                  },
                };
              },
              write: async (ctx, v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1)
                  throw bad('Enter a whole number of 1 or more.');
                await updateBusiness(d, ctx, { aiRateLimitPerMinute: n });
              },
            }),
          ],
        },
        {
          title: 'Specialist agent access',
          hint: 'Owner controls · manual reviews',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-inventory-enabled',
              policy: 'agents.inventoryEnabled',
              kind: 'toggle',
              label: 'Inventory Intelligence Agent',
              description:
                'Allows authorized users to start manual, read-only inventory reviews. The separate AI feature switch controls whether aggregate evidence may be sent for an AI explanation.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Enabled', tone: 'green' },
              off: { text: 'Disabled', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-enabled',
              policy: 'agents.financeEnabled',
              kind: 'toggle',
              label: 'Financial Intelligence Agent',
              description:
                'Allows authorized users to start manual Profit & Analytics reviews. The agent does not post journals, reconcile transactions or move money.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit & Analytics',
                href: '/profit',
              },
              on: { text: 'Enabled', tone: 'green' },
              off: { text: 'Disabled', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-enabled',
              policy: 'agents.customerEnabled',
              kind: 'toggle',
              label: 'Customer Intelligence Agent',
              description:
                'Allows authorized users to run aggregate CRM reviews and prepare versioned segment proposals. A separate exact human approval saves a canonical Segment; later definition edits require reapproval. It does not send messages, merge or change customer records.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Customers', href: '/customers' },
              on: { text: 'Enabled', tone: 'green' },
              off: { text: 'Disabled', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-seo-enabled',
              policy: 'agents.seoEnabled',
              kind: 'toggle',
              label: 'SEO Autopilot Agent',
              description:
                'Allows authorized users to start manual reviews of the existing SEO workspace queue. It does not publish website changes or send outreach.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open SEO Workspace',
                href: '/marketing/seo-autopilot/workspace',
              },
              on: { text: 'Enabled', tone: 'green' },
              off: { text: 'Disabled', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-enabled',
              policy: 'agents.commerceEnabled',
              kind: 'toggle',
              label: 'Autonomous Commerce Agent',
              description:
                'Allows authorized users to start manual, read-only Commerce reviews. Commerce autonomy level and its separate AI feature switch still apply.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Agents & Tools',
                href: '/autonomous-commerce/agent-tools',
              },
              on: { text: 'Enabled', tone: 'green' },
              off: { text: 'Disabled', tone: 'neutral' },
            }),
          ],
        },
        {
          title: 'Scheduled specialist reviews',
          hint: 'Optional · read-only · once per UTC day',
          footer:
            'Each enabled review runs on the next hourly scheduler tick, at most once per UTC day. It only reads canonical module data and records evidence; it does not perform proposed actions. Scheduled runs do not request optional AI explanations.',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-inventory-daily-review',
              policy: 'agents.inventoryDailyReviewEnabled',
              kind: 'toggle',
              label: 'Schedule Inventory review',
              description:
                'Create a daily evidence-backed review of inventory, reorder, count and recorded wastage signals.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Daily review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-daily-review',
              policy: 'agents.financeDailyReviewEnabled',
              kind: 'toggle',
              label: 'Schedule Finance review',
              description:
                'Create a daily review of the current UTC calendar month using the canonical Profit Analytics sources.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Profit & Analytics', href: '/profit' },
              on: { text: 'Daily review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-daily-review',
              policy: 'agents.customerDailyReviewEnabled',
              kind: 'toggle',
              label: 'Schedule Customer review',
              description:
                'Create a daily aggregate CRM review; it does not contact customers or activate a campaign.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Customers', href: '/customers' },
              on: { text: 'Daily review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-seo-daily-review',
              policy: 'agents.seoDailyReviewEnabled',
              kind: 'toggle',
              label: 'Schedule SEO review',
              description:
                'Create a daily review of the existing SEO Workspace queue; no search traffic or provider metrics are estimated.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open SEO Workspace',
                href: '/marketing/seo-autopilot/workspace',
              },
              on: { text: 'Daily review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-daily-review',
              policy: 'agents.commerceDailyReviewEnabled',
              kind: 'toggle',
              label: 'Schedule Commerce review',
              description:
                'Create a daily read-only review of recorded Commerce queues. Commerce autonomy must also be enabled.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Agents & Tools',
                href: '/autonomous-commerce/agent-tools',
              },
              on: { text: 'Daily review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
          ],
        },
        {
          title: 'Specialist AI event reviews',
          hint: 'Optional · read-only · source-event driven',
          footer:
            'When enabled, completed or partial site audits queue one SEO workspace review; canonical low-stock scans, applied physical stock counts, fully received purchase orders and confirmed branch-transfer receipts can each queue one Inventory review per eligible branch, while recorded wastage can queue a read-only Inventory review for its business; newly-lapsed customer events and customer-linked completed sales queue at most one aggregate Customer review per business per UTC day, while customer no-shows and cancellations queue privacy-minimized Customer reviews. Product Validation, current supplier-quote and failed-delivery events queue a Commerce review, and newly saved expenses queue a Finance review. Reviews are read-only and do not request AI explanations or apply changes. Commerce reviews also require Commerce autonomy to be enabled.',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-seo-audit-event-review',
              policy: 'agents.seoAuditEventReviewEnabled',
              kind: 'toggle',
              label: 'Review SEO workspace after site audits',
              description:
                'Start one read-only SEO agent review after each completed or partial site audit. Duplicate delivery of the same audit does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open SEO Workspace',
                href: '/marketing/seo-autopilot/workspace',
              },
              on: { text: 'Audit review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-inventory-low-stock-event-review',
              policy: 'agents.inventoryLowStockEventReviewEnabled',
              kind: 'toggle',
              label: 'Review inventory after low-stock events',
              description:
                'Start one read-only Inventory review after the canonical low-stock scan records an event. Duplicate delivery of the same event does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Low-stock review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-inventory-stock-count-event-review',
              policy: 'agents.inventoryStockCountEventReviewEnabled',
              kind: 'toggle',
              label: 'Review inventory after stock counts',
              description:
                'Start one read-only Inventory review after a physical stock count is applied. Duplicate delivery of the same applied count does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Count review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-inventory-purchase-order-received-event-review',
              policy: 'agents.inventoryPurchaseOrderReceivedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review inventory after fully received purchase orders',
              description:
                'Start one read-only Inventory review after a canonical purchase order is fully received. Partial receipts do not queue a review; duplicate delivery of the final receipt does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Receipt review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-inventory-stock-transfer-received-event-review',
              policy: 'agents.inventoryStockTransferReceivedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review inventory after branch transfers',
              description:
                'After a branch transfer is confirmed received, queue one read-only Inventory review for each branch with this setting enabled. Each review stays inside that branch’s business data; duplicate delivery does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Transfer review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-inventory-wastage-event-review',
              policy: 'agents.inventoryWastageEventReviewEnabled',
              kind: 'toggle',
              label: 'Review inventory after recorded wastage',
              description:
                'Start one read-only Inventory review after a wastage movement is recorded. Duplicate delivery of the same movement does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
              on: { text: 'Wastage review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-lapsed-event-review',
              policy: 'agents.customerLapsedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review customer retention after lapsed events',
              description:
                'Queue an aggregate, read-only Customer review when the CRM marks a customer as newly lapsed. Multiple lapsed transitions are coalesced to one review per business per UTC day.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Customer Intelligence',
                href: '/customers',
              },
              on: { text: 'Lapsed review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-delivery-failed-event-review',
              policy: 'agents.customerDeliveryFailedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review customer context after failed deliveries',
              description:
                'Create a privacy-minimized Customer Agent review after a delivery is recorded as failed. It stores no contact details, does not determine channel-specific consent, and never drafts or sends a message.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Customer Intelligence',
                href: '/customers',
              },
              on: { text: 'Failure review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-no-show-event-review',
              policy: 'agents.customerNoShowEventReviewEnabled',
              kind: 'toggle',
              label: 'Review customer context after appointment no-shows',
              description:
                'Create one read-only, privacy-minimized Customer review when an appointment is marked no-show. It does not infer a reason, draft a message, or contact the customer.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Customers', href: '/customers' },
              on: { text: 'No-show review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-appointment-cancelled-event-review',
              policy: 'agents.customerAppointmentCancelledEventReviewEnabled',
              kind: 'toggle',
              label: 'Review customer context after appointment cancellations',
              description:
                'Create one read-only, privacy-minimized Customer review when an appointment is cancelled. It does not infer the reason, draft a message, or contact the customer.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Customers', href: '/customers' },
              on: { text: 'Cancellation review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-customer-completed-sale-event-review',
              policy: 'agents.customerCompletedSaleEventReviewEnabled',
              kind: 'toggle',
              label: 'Review customer retention after completed sales',
              description:
                'Queue one aggregate, read-only Customer review per business per UTC day after a customer-linked sale completes. The review uses canonical CRM analytics and never drafts or sends a message.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: { label: 'Open Customer Intelligence', href: '/customers' },
              on: { text: 'Sale review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-validation-event-review',
              policy: 'agents.commerceValidationEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Commerce after validation events',
              description:
                'Start one read-only Commerce review after a Product Validation decision or catalog draft creation. Commerce autonomy must also be enabled; duplicate delivery of the same event does not create another run.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Autonomous Commerce',
                href: '/autonomous-commerce/agent-tools',
              },
              on: { text: 'Validation review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-delivery-failure-event-review',
              policy: 'agents.commerceDeliveryFailedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Commerce after failed deliveries',
              description:
                'Start one read-only Commerce exception review when a delivery is recorded as failed. The worker rechecks the current delivery state; no customer message or delivery change is made.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Autonomous Commerce',
                href: '/autonomous-commerce/agent-tools',
              },
              on: { text: 'Failure review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-rfq-quote-event-review',
              policy: 'agents.commerceRfqQuoteEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Commerce after supplier quotes',
              description:
                'Start one read-only Commerce review after a current supplier quote is recorded for an open RFQ. The worker rechecks that the RFQ and quote are still current; it does not award the RFQ or create a purchase order.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Autonomous Commerce',
                href: '/autonomous-commerce/agent-tools',
              },
              on: { text: 'Quote review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-experiment-decision-event-review',
              policy: 'agents.commerceExperimentDecisionEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Commerce after experiment decisions',
              description:
                'Start a read-only review after an experiment is adopted, reverted or marked inconclusive. Results are observational, not causal; the agent does not change the product, price or listing.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Experiment Lab',
                href: '/autonomous-commerce/experiment-lab',
              },
              on: { text: 'Decision review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-commerce-reconciliation-event-review',
              policy: 'agents.commerceReconciliationEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Commerce after listing checks',
              description:
                'Queue a read-only review after a provider reconciliation completes. The worker uses the saved check and current discrepancies; it does not call the provider again or change a listing.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Reconciliation',
                href: '/autonomous-commerce/reconciliation',
              },
              on: { text: 'Listing review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-expense-event-review',
              policy: 'agents.financeExpenseEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Profit Analytics after expenses',
              description:
                'Start one read-only Finance review after a new expense is saved, using its recorded month and the canonical Profit Analytics calculation. It does not post or change finance records.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit Analytics',
                href: '/profit',
              },
              on: { text: 'Expense review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-completed-order-event-review',
              policy: 'agents.financeCompletedOrderEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Profit Analytics after completed orders',
              description:
                'Start one read-only Finance review per UTC day after a canonical non-quotation order is completed, using the same month as Profit Analytics. A completed order may still be unpaid or on credit; this review does not treat it as cash, post journals, or change finance records.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit Analytics',
                href: '/profit',
              },
              on: { text: 'Order review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-approved-return-event-review',
              policy: 'agents.financeApprovedReturnEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Profit Analytics after approved returns',
              description:
                'Queue one read-only Finance review per UTC day after a canonical return is approved. The review lists approved return records separately from Profit Analytics; it does not subtract them from profit or claim final provider settlement.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit Analytics',
                href: '/profit',
              },
              on: { text: 'Return review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-approved-budget-event-review',
              policy: 'agents.financeApprovedBudgetEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Finance after approved budgets',
              description:
                'Queue one read-only Finance review for each newly approved budget version. It uses the approved month and canonical Profit Analytics data; it does not post journals or change finance records.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit Analytics',
                href: '/profit',
              },
              on: { text: 'Budget review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-posted-journal-event-review',
              policy: 'agents.financePostedJournalEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Finance after journals are posted',
              description:
                'Queue one read-only Finance review after a Noxtill manual journal is posted. It reviews the canonical posted entry and Profit Analytics; it never edits or reverses the journal.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Profit Analytics',
                href: '/profit',
              },
              on: { text: 'Posted-journal review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'specialist-agent-finance-statement-imported-event-review',
              policy: 'agents.financeStatementImportedEventReviewEnabled',
              kind: 'toggle',
              label: 'Review Finance after statement imports',
              description:
                'Queue one read-only Finance review after a statement CSV is imported. It uses the saved dates and amounts to refresh the current reconciliation evidence; the source file and bank descriptions are not retained, and no match is accepted automatically.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              link: {
                label: 'Open Reconciliation',
                href: '/profit/reconciliation',
              },
              on: { text: 'Import review on', tone: 'green' },
              off: { text: 'Manual only', tone: 'neutral' },
            }),
          ],
        },
        {
          title: 'Specialist AI per-run request ceiling',
          hint: 'Server-enforced cap · each persisted specialist run',
          footer:
            'Every provider request is reserved before it starts. Failed or interrupted requests count toward this run ceiling, so a retry loop cannot keep calling the provider. The separate monthly request and estimated-spend limits still apply.',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-provider-requests-per-run',
              policy: 'agents.specialistMaxProviderRequestsPerRun',
              kind: 'number',
              label: 'Maximum AI provider requests per specialist run',
              description:
                'Stops additional model requests for this saved agent run after the configured count. Start a new review for a fresh run; the existing deterministic review remains available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / run',
              format: (value) =>
                `${value} request${value === 1 ? '' : 's'} / run`,
            }),
            policyRow(d, {
              key: 'specialist-agent-output-tokens-per-request',
              policy: 'agents.specialistMaxOutputTokensPerRequest',
              kind: 'number',
              label: 'Maximum output tokens per specialist AI request',
              description:
                'Refuses a specialist provider request before it starts when its requested output-token allowance exceeds this cap. This is an output-token limit; it does not measure or cap input-context tokens.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'output tokens / request',
              format: (value) => `${value} output tokens / request`,
            }),
            policyRow(d, {
              key: 'specialist-agent-input-bytes-per-request',
              policy: 'agents.specialistMaxInputBytesPerRequest',
              kind: 'number',
              label: 'Maximum serialized input size per specialist AI request',
              description:
                'Rejects an oversized serialized request before reserving usage or contacting the provider. This is a byte limit, not a token count or a guarantee about model context usage.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'bytes / request',
              format: (value) =>
                `${value.toLocaleString('en-US')} bytes / request`,
            }),
          ],
        },
        {
          title: 'Commerce Agent read-tool ceiling',
          hint: 'Server-enforced · one question run · read-only tools',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-commerce-read-tools-per-run',
              policy: 'agents.commerceMaxReadToolCallsPerRun',
              kind: 'number',
              label: 'Maximum read-tool calls per Commerce Agent run',
              description:
                'Limits how many registered read-only Commerce tools one AI question can run. Any additional requested tools are refused and recorded; no write tools are available in this question flow.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'tool calls / run',
              format: (value) =>
                `${value} read-tool call${value === 1 ? '' : 's'} / run`,
            }),
          ],
        },
        {
          title: 'Specialist tool-call budget',
          hint: 'Server-enforced · per run · all five agents',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-tool-calls-per-run',
              policy: 'agents.maxToolCallsPerRun',
              kind: 'number',
              label: 'Maximum tool calls per specialist run',
              description:
                'Limits registered tool calls across Inventory, Finance, Customer, SEO and Commerce. Failed or refused calls count toward the run limit; retries in the same call slot do not use another slot.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'tool calls / run',
              format: (value) =>
                `${value} tool call${value === 1 ? '' : 's'} / run`,
            }),
          ],
        },
        {
          title: 'Per-agent tool-call overrides',
          hint: 'Server-enforced · per run · optional overrides',
          footer:
            'An empty value uses the shared specialist tool-call limit. Each configured override applies only to that agent.',
          rows: [
            ...SPECIALIST_TOOL_CALL_OVERRIDES.map(({ key, policy, label }) =>
              policyRow(d, {
                key: `specialist-agent-${key}-tool-calls-per-run`,
                policy,
                kind: 'number',
                label: `Maximum tool calls per ${label} Agent run`,
                description:
                  'Overrides the shared per-run tool-call limit for this agent. Failed and refused calls count; retries in the same call slot do not use another slot.',
                requires: CAPABILITIES.AI_SETTINGS_MANAGE,
                risk: 'Medium',
                unit: 'tool calls / run',
                emptyLabel: 'Use shared limit',
                format: (value) =>
                  `${value} tool call${value === 1 ? '' : 's'} / run`,
              }),
            ),
          ],
        },
        {
          title: 'Commerce Agent write-tool allow-list',
          hint: 'Server-enforced · per business · additional to autonomy and approval gates',
          footer:
            'Enter registered write-tool keys separated by commas. Read-only tools are controlled by the Commerce autonomy level. An empty list blocks every write tool; approval and pause rules still apply to listed tools.',
          rows: [
            policyRow(d, {
              key: 'commerce-agent-write-tool-allowlist',
              policy: 'commerce.agentAllowedWriteTools',
              kind: 'text',
              label: 'Allowed Commerce Agent write tools',
              description:
                'Only these registered write-tool keys may create drafts or approval requests. The current registry and exact keys are shown in Autonomous Commerce → Agents & Tools. Unknown keys fail closed and block Commerce write tools.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'High',
              impact:
                'Changing this list may block new writes and pending approvals. Every approval re-checks the current list before canonical execution.',
              link: {
                label: 'Open Agents & Tools',
                href: '/autonomous-commerce/agent-tools',
              },
              placeholder: 'create_listing_draft,create_rfq',
              emptyLabel: 'No write tools allowed',
              format: (value) => {
                const count = value
                  .split(',')
                  .filter((key) => key.trim()).length;
                return `${count} registered tool key${count === 1 ? '' : 's'}`;
              },
            }),
          ],
        },
        {
          title: 'Specialist AI monthly request limits',
          hint: 'Optional server-enforced caps · UTC calendar month',
          footer:
            'These are request-count limits, not dollar budgets. A request is reserved before contacting the AI provider; failed and abandoned requests count. The shared business AI cost cap still applies separately.',
          rows: [
            specialistRequestLimitRow('inventory_intelligence', {
              key: 'specialist-agent-inventory-monthly-requests',
              policy: 'agents.inventoryMaxRequestsPerMonth',
              kind: 'number',
              label: 'Inventory Agent monthly AI requests',
              description:
                'Blocks the next optional AI explanation after this many requests in the UTC month. Manual deterministic inventory reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / month',
              format: formatMonthlyRequests,
              emptyLabel: 'No limit',
            }),
            specialistRequestLimitRow('financial_intelligence', {
              key: 'specialist-agent-finance-monthly-requests',
              policy: 'agents.financeMaxRequestsPerMonth',
              kind: 'number',
              label: 'Finance Agent monthly AI requests',
              description:
                'Blocks the next optional AI explanation after this many requests in the UTC month. Deterministic Profit & Analytics reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / month',
              format: formatMonthlyRequests,
              emptyLabel: 'No limit',
            }),
            specialistRequestLimitRow('customer_intelligence', {
              key: 'specialist-agent-customer-monthly-requests',
              policy: 'agents.customerMaxRequestsPerMonth',
              kind: 'number',
              label: 'Customer Agent monthly AI requests',
              description:
                'Blocks the next optional AI explanation after this many requests in the UTC month. Deterministic CRM reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / month',
              format: formatMonthlyRequests,
              emptyLabel: 'No limit',
            }),
            specialistRequestLimitRow('seo_autopilot', {
              key: 'specialist-agent-seo-monthly-requests',
              policy: 'agents.seoMaxRequestsPerMonth',
              kind: 'number',
              label: 'SEO Agent monthly AI requests',
              description:
                'Blocks the next optional AI explanation after this many requests in the UTC month. The deterministic SEO workspace review remains available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / month',
              format: formatMonthlyRequests,
              emptyLabel: 'No limit',
            }),
            specialistRequestLimitRow('autonomous_commerce', {
              key: 'specialist-agent-commerce-monthly-requests',
              policy: 'agents.commerceMaxRequestsPerMonth',
              kind: 'number',
              label: 'Commerce Agent monthly AI requests',
              description:
                'Blocks the next optional AI explanation after this many requests in the UTC month. Deterministic Commerce reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'requests / month',
              format: formatMonthlyRequests,
              emptyLabel: 'No limit',
            }),
          ],
        },
        {
          title: 'Specialist AI monthly spend budgets',
          hint: 'Optional server-enforced estimated USD caps · UTC month',
          footer:
            'Successful requests use returned token counts at the configured model’s published-rate estimate. Pending or failed requests hold a conservative maximum reservation. Failed requests may therefore remain reserved for this month. This is not a provider invoice; the business-wide AI cost cap still applies separately.',
          rows: [
            specialistSpendLimitRow(
              'inventory_intelligence',
              'inventory_agent',
              {
                key: 'specialist-agent-inventory-monthly-spend',
                policy: 'agents.inventoryMaxSpendUsdPerMonth',
                kind: 'number',
                label: 'Inventory Agent monthly AI spend budget',
                description:
                  'Refuses an optional AI explanation before the provider call if its conservative maximum estimate would exceed this UTC-month budget. Deterministic inventory reviews remain available.',
                requires: CAPABILITIES.AI_SETTINGS_MANAGE,
                risk: 'Medium',
                unit: 'USD / month',
                step: 0.01,
                format: (value) => `$${value.toFixed(2)} / month`,
                emptyLabel: 'No cap',
              },
            ),
            specialistSpendLimitRow('financial_intelligence', 'finance_agent', {
              key: 'specialist-agent-finance-monthly-spend',
              policy: 'agents.financeMaxSpendUsdPerMonth',
              kind: 'number',
              label: 'Finance Agent monthly AI spend budget',
              description:
                'Refuses an optional AI explanation before the provider call if its conservative maximum estimate would exceed this UTC-month budget. Deterministic Profit & Analytics reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'USD / month',
              step: 0.01,
              format: (value) => `$${value.toFixed(2)} / month`,
              emptyLabel: 'No cap',
            }),
            specialistSpendLimitRow('customer_intelligence', 'customer_agent', {
              key: 'specialist-agent-customer-monthly-spend',
              policy: 'agents.customerMaxSpendUsdPerMonth',
              kind: 'number',
              label: 'Customer Agent monthly AI spend budget',
              description:
                'Refuses an optional AI explanation before the provider call if its conservative maximum estimate would exceed this UTC-month budget. Deterministic CRM reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'USD / month',
              step: 0.01,
              format: (value) => `$${value.toFixed(2)} / month`,
              emptyLabel: 'No cap',
            }),
            specialistSpendLimitRow('seo_autopilot', 'seo_agent', {
              key: 'specialist-agent-seo-monthly-spend',
              policy: 'agents.seoMaxSpendUsdPerMonth',
              kind: 'number',
              label: 'SEO Agent monthly AI spend budget',
              description:
                'Refuses an optional AI explanation before the provider call if its conservative maximum estimate would exceed this UTC-month budget. The deterministic SEO workspace review remains available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'USD / month',
              step: 0.01,
              format: (value) => `$${value.toFixed(2)} / month`,
              emptyLabel: 'No cap',
            }),
            specialistSpendLimitRow('autonomous_commerce', 'commerce_agent', {
              key: 'specialist-agent-commerce-monthly-spend',
              policy: 'agents.commerceMaxSpendUsdPerMonth',
              kind: 'number',
              label: 'Commerce Agent monthly AI spend budget',
              description:
                'Refuses an optional AI explanation before the provider call if its conservative maximum estimate would exceed this UTC-month budget. Deterministic Commerce reviews remain available.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'USD / month',
              step: 0.01,
              format: (value) => `$${value.toFixed(2)} / month`,
              emptyLabel: 'No cap',
            }),
          ],
        },
        {
          title: 'Inventory Agent review',
          hint: 'Owner controls · reorder and quantity rules',
          rows: [
            policyRow(d, {
              key: 'inventory-agent-reorder-lead-time-days',
              policy: 'inventory.agentReorderLeadTimeDays',
              kind: 'number',
              label: 'Reorder planning lead-time baseline',
              description:
                'Used by the canonical Reorder Suggestions formula and Inventory Agent. This is a planning assumption in days, not a supplier delivery promise. Product-specific historical lead time is shown separately as sensitivity evidence.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              unit: 'days',
              format: (value) => `${value} days`,
              link: {
                label: 'Open Reorder Suggestions',
                href: '/inventory/reorder-suggestions',
              },
            }),
            policyRow(d, {
              key: 'inventory-agent-count-variance-minimum-units',
              policy: 'inventory.agentCountVarianceMinimumUnits',
              kind: 'number',
              label: 'Minimum repeated count adjustment units',
              description:
                'Only repeated applied-count patterns whose summed absolute corrections meet this unit threshold are shown. This filters quantity only; it does not estimate financial materiality or identify a cause.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              unit: 'units',
              emptyLabel: 'No minimum',
              format: (value) => `${value} units`,
              link: {
                label: 'Open Inventory',
                href: '/inventory/reorder-suggestions',
              },
            }),
          ],
        },
        {
          title: 'Customer Agent retention review',
          hint: 'Owner control · completed-order activity rule',
          rows: [
            policyRow(d, {
              key: 'customer-agent-retention-minimum-order-decline',
              policy: 'agents.customerRetentionMinimumOrderDecline',
              kind: 'number',
              label: 'Minimum completed-order decline',
              description:
                'Show a human review cue only when this customer has at least this many fewer completed non-quotation orders than in the previous 30-day window. It is a rule-based cue, not a churn prediction or a cause.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              unit: 'fewer orders',
              format: (value) =>
                `${value} fewer order${value === 1 ? '' : 's'}`,
              link: {
                label: 'Open Customer Intelligence',
                href: '/customers',
              },
            }),
          ],
        },
        {
          title: 'Features',
          hint: 'Owner controls',
          rows: AI_FEATURES.map(aiFeatureRow),
        },
        {
          title: 'Customer contact details',
          hint: 'Enforced in the AI Assistant',
          footer:
            'The assistant still sees customer names, spend and visit counts. It does not apply to text you type into the chat yourself, and other AI features are governed by the switches above.',
          rows: [
            policyRow(d, {
              key: 'ai-redact',
              policy: 'ai.redactContacts',
              kind: 'toggle',
              label: 'Hide customer phone and email from the AI Assistant',
              description:
                'Phone numbers and email addresses in what the assistant looks up are masked (for example •••4567) before the assistant sees them.',
              risk: 'High',
              impact:
                'The assistant can no longer read out a customer’s full contact details.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              on: { text: 'Masked', tone: 'green' },
              off: { text: 'Visible to the assistant', tone: 'amber' },
            }),
          ],
        },
        {
          title: 'What AI may do',
          hint: 'Not configurable',
          rows: [
            row({
              key: 'ai-tools',
              label: 'Assistant data tools',
              description:
                'The assistant looks things up. None of its tools writes data.',
              risk: 'High',
              state: () => ({ value: 'Read-only', tone: 'green' }),
            }),
            row({
              key: 'ai-voice',
              label: 'Voice commands',
              description:
                'Add expense, add customer, record wastage and record cash movement are drafted, then need your confirmation.',
              risk: 'High',
              state: () => ({ value: 'Confirmation required', tone: 'green' }),
            }),
          ],
        },
        {
          title: 'Specialist agent evidence retention',
          hint: 'Optional · audited cleanup · completed runs only',
          footer:
            'When the retention age is reached, transient evidence and run payloads are cleared only for completed runs with no recommendations or material actions. Run status, token/cost usage and redacted tool-call history remain. Runs with recommendations or actions are preserved so their review and action audit stays available. No value keeps evidence indefinitely.',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-run-retention-days',
              policy: 'agents.specialistRunRetentionDays',
              kind: 'number',
              label: 'Specialist run evidence retention',
              description:
                'Clear transient source evidence, request context, generated run output and provider tool-result traces after this many days. Only finished runs with no recommendation or material action are eligible. The cleanup is audited and preserves run status and cost/token records.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'High',
              unit: 'days',
              emptyLabel: 'Keep forever',
              format: (value) => `${value} days`,
            }),
          ],
        },
        {
          title: 'Specialist action budget',
          hint: 'Server-enforced · per specialist run · all five agents',
          footer:
            'Counts material action proposals created by a run. Repeated or concurrent proposals cannot exceed the limit. This does not execute an approved action; each canonical module still owns execution and verification.',
          rows: [
            policyRow(d, {
              key: 'specialist-agent-actions-per-run',
              policy: 'agents.maxMaterialActionsPerRun',
              kind: 'number',
              label: 'Maximum material actions per specialist run',
              description:
                'Caps the total number of material action proposals one specialist run can create across Inventory, Finance, Customer, SEO and Commerce.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              risk: 'Medium',
              unit: 'actions / run',
              format: (value) =>
                `${value} action${value === 1 ? '' : 's'} / run`,
            }),
          ],
        },
      ],
    },
    {
      key: 'integrations',
      label: 'Integrations',
      title: 'Integrations',
      icon: 'plug-zap',
      group: 'Intelligence',
      description:
        'Connected external services and the real state of each connection.',
      affects: ['Marketing', 'Reviews', 'Reports', 'Unified Inbox'],
      affectsNote:
        'A connection that needs attention cannot sync until it is reconnected.',
      help: [
        'States are connected, needs attention or not connected — never a fabricated live badge.',
        'Only services Noxtill can genuinely connect to are listed.',
        'Disconnecting stops syncing; data already synced is kept.',
      ],
      actions: [
        {
          label: 'Open Integrations',
          icon: 'external-link',
          primary: true,
          href: '/integrations',
          kind: 'link',
        },
      ],
      groups: [
        {
          title: 'Connected',
          hint: 'Real sync state',
          dynamicRows: async (ctx) => {
            const list = await d.prisma.integration.findMany({
              where: {
                businessId: ctx.businessId,
                status: { in: ['connected', 'needs_attention'] },
              },
              orderBy: { provider: 'asc' },
            });
            if (list.length === 0)
              return [
                row({
                  key: 'int-none',
                  label: 'Connected services',
                  description: 'No integration is connected.',
                  link: { label: 'Connect a service', href: '/integrations' },
                  state: () => ({ value: 'None', tone: 'neutral' }),
                }),
              ];
            return list.map((i): RowDef =>
              row({
                key: `integration:${i.provider}`,
                label: PROVIDER_LABELS[i.provider] ?? i.provider,
                description:
                  `Connected ${i.connectedAt ? relativeTime(i.connectedAt, ctx.now) : ''}. Last synced ${i.lastSyncAt ? relativeTime(i.lastSyncAt, ctx.now) : 'never'}.`.replace(
                    'Connected . ',
                    '',
                  ),
                risk: i.status === 'needs_attention' ? 'High' : 'Medium',
                link: { label: 'Open integration', href: '/integrations' },
                state: () => ({
                  value:
                    i.status === 'connected' ? 'Connected' : 'Needs attention',
                  tone: i.status === 'connected' ? 'green' : 'amber',
                }),
              }),
            );
          },
        },
        {
          title: 'Not connected',
          hint: 'Nothing is faked',
          rows: [
            row({
              key: 'int-available',
              label: 'Other services',
              description:
                'Services Noxtill can connect to that you have not connected.',
              link: { label: 'Browse integrations', href: '/integrations' },
              state: async (ctx) => {
                const connected = await d.prisma.integration.count({
                  where: {
                    businessId: ctx.businessId,
                    status: { in: ['connected', 'needs_attention'] },
                  },
                });
                return {
                  value: `${Math.max(0, Object.values(IntegrationProvider).length - connected)} available`,
                };
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'api',
      label: 'API & Webhooks',
      title: 'API & Webhooks',
      icon: 'key-round',
      group: 'Intelligence',
      description:
        'Keys, scopes and event endpoints for connecting your own systems.',
      affects: ['Integrations', 'Every module'],
      affectsNote:
        'An API key can read whatever its scopes allow, so scope is the real security boundary.',
      help: [
        'A key’s secret is shown once at creation and never again. Revoke and recreate rather than recover.',
        'Webhook deliveries record their response and status so failures are diagnosable.',
        'Revoking a key takes effect immediately and breaks anything using it.',
      ],
      actions: [
        {
          label: 'Manage keys and webhooks',
          icon: 'external-link',
          primary: true,
          href: '/settings/tools/developer',
          kind: 'link',
        },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'API keys',
          hint: 'Scope is the security boundary',
          dynamicRows: async (ctx) => {
            const keys = await d.prisma.apiKey.findMany({
              where: { businessId: ctx.businessId, revokedAt: null },
              orderBy: { createdAt: 'desc' },
            });
            if (keys.length === 0)
              return [
                row({
                  key: 'api-none',
                  label: 'Active keys',
                  description: 'No API key is active.',
                  link: {
                    label: 'Create a key',
                    href: '/settings/tools/developer',
                  },
                  state: () => ({ value: 'None', tone: 'neutral' }),
                }),
              ];
            return keys.map((k): RowDef =>
              row({
                key: `apikey:${k.id}`,
                label: `Key · ${k.name}`,
                description: `${k.keyPrefix}… · ${plural(((k.scopes as unknown as string[]) ?? []).length, 'scope')} · last used ${k.lastUsedAt ? relativeTime(k.lastUsedAt, ctx.now) : 'never'}.`,
                risk: 'High',
                requires: CAPABILITIES.INTEGRATIONS_MANAGE,
                impact:
                  'Revoking takes effect at once and breaks anything currently using the key. There is no grace period.',
                state: () => ({
                  value: 'Revoke',
                  tone: 'neutral',
                  control: {
                    type: 'action',
                    label: 'Revoke',
                    actionKey: `apikey:${k.id}`,
                    tone: 'red',
                    confirm:
                      'Anything using this key stops working immediately.',
                  },
                }),
              }),
            );
          },
        },
        {
          title: 'Webhooks',
          hint: 'Deliveries are diagnosable',
          rows: [
            row({
              key: 'wh-endpoints',
              label: 'Endpoints',
              description: 'Webhook destinations that receive events.',
              state: async (ctx) => {
                const [on, off] = await Promise.all([
                  d.prisma.outboundWebhook.count({
                    where: { businessId: ctx.businessId, active: true },
                  }),
                  d.prisma.outboundWebhook.count({
                    where: { businessId: ctx.businessId, active: false },
                  }),
                ]);
                return { value: `${on} active${off ? ` · ${off} off` : ''}` };
              },
            }),
            row({
              key: 'wh-failed',
              label: 'Failed deliveries',
              description:
                'Deliveries that failed after all attempts in the last 24 hours.',
              state: async (ctx) => {
                const n = await d.prisma.outboundWebhookDelivery.count({
                  where: {
                    webhook: { businessId: ctx.businessId },
                    status: 'failed',
                    lastAttemptAt: {
                      gte: new Date(ctx.now.getTime() - 86_400_000),
                    },
                  },
                });
                return {
                  value: n ? `${n} failed` : 'None',
                  tone: n ? 'amber' : 'green',
                };
              },
            }),
            row({
              key: 'wh-retry',
              label: 'Retry policy',
              description: 'How a failed delivery is retried.',
              state: () => ({ value: '5 attempts · exponential backoff' }),
            }),
            row({
              key: 'wh-signature',
              label: 'Signature',
              description:
                'Every delivery is signed so you can verify it came from Noxtill.',
              state: () => ({ value: 'HMAC-SHA256', tone: 'green' }),
            }),
          ],
        },
      ],
    },
  ];
}
