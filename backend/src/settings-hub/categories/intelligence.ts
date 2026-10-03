import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { IntegrationProvider } from '@prisma/client';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural, relativeTime } from '../hub.core';
import { HubDeps, asJson, business, monthStart, updateBusiness } from './hub.deps';
import { policyRow } from './policy-rows';
import { assertAutomationGovernance } from '../../marketing/automations/automation-governance.util';
import {
  workflowGraphActions,
  type WorkflowGraph,
} from '../../marketing/automations/workflow-graph.util';
import { BI_OVERVIEW_WIDGETS } from '../../business-intelligence/business-intelligence.constants';
import { WIDGET_REGISTRY } from '../../widgets/widget-registry';
import { WIDGET_CACHE_TTL_MS } from '../../widgets/widgets.constants';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

const AI_FEATURES: { key: string; label: string; description: string }[] = [
  { key: 'assistant', label: 'Business assistant', description: 'The chat assistant that answers questions from your data.' },
  { key: 'insights', label: 'AI insights', description: 'Suggestions shown on the dashboard and Business Brain.' },
  { key: 'whatIf', label: 'What-if simulations', description: 'Scenario estimates built from your recorded data.' },
  { key: 'reviewReplies', label: 'Review reply drafts', description: 'Drafts a reply to a review for a person to send.' },
  { key: 'campaignCopy', label: 'Campaign copy', description: 'Drafts marketing message copy for a person to approve.' },
  { key: 'voiceEntry', label: 'Voice entry', description: 'Turns a spoken command into a draft you confirm before anything is saved.' },
  { key: 'photoDigitizer', label: 'Photo digitizer', description: 'Reads a photo of a list into rows you review before importing.' },
  { key: 'workflowAgents', label: 'Workflow AI drafts & agents', description: 'AI-draft and read-only AI agent workflow steps. Their output appears in run history and is not sent automatically.' },
];

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email', gmb: 'Google Business Profile', google_ads: 'Google Ads', merchant: 'Google Merchant Center', meta_ads: 'Meta Ads', tiktok_ads: 'TikTok Ads', bing_places: 'Bing Places', apple_business_connect: 'Apple Business Connect', yelp: 'Yelp', linkedin_ads: 'LinkedIn Ads', pinterest_ads: 'Pinterest Ads', snapchat_ads: 'Snapchat Ads', microsoft_ads: 'Microsoft Ads', amazon_ads: 'Amazon Ads', reddit_ads: 'Reddit Ads', quickbooks: 'QuickBooks', xero: 'Xero', shopify: 'Shopify', woocommerce: 'WooCommerce', zapier: 'Zapier', make: 'Make', n8n: 'n8n', developer: 'Developer API',
};

export function intelligenceCategories(d: HubDeps): CategoryDef[] {
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
        const on = ((b.aiFeatureToggles ?? {}) as Record<string, boolean>)[f.key] !== false;
        return { value: on ? 'On' : 'Off', tone: on ? 'green' : 'neutral', control: { type: 'toggle', on } };
      },
      write: async (ctx, v: HubValue) => {
        const b = await business(d, ctx);
        const next = { ...((b.aiFeatureToggles ?? {}) as Record<string, boolean>), [f.key]: Boolean(v) };
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
      description: 'Your workflows, whether they are running, and what happened when they last ran.',
      affects: ['Bookings', 'Credit', 'Marketing', 'Reviews', 'Inventory'],
      affectsNote: 'Turning a workflow off stops it firing for new events; past runs are kept.',
      help: [
        'A failed run is recorded with its reason. You can manually retry eligible failed actions within the retry limit.',
        'Workflows can run from matching events or from a configured schedule. Durable waits and schedule recovery require Redis.',
        'Workflow actions can message customers, update customer tags and fields, wait, request approval, and create AI drafts saved to run history.',
      ],
      actions: [{ label: 'Open Automations', icon: 'external-link', href: '/marketing/automations', kind: 'link' }, { label: 'View history', icon: 'history', kind: 'history' }],
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
                const [on, off] = await Promise.all([d.prisma.workflow.count({ where: { businessId: ctx.businessId, active: true } }), d.prisma.workflow.count({ where: { businessId: ctx.businessId, active: false } })]);
                return { value: `${on} on · ${off} off` };
              },
            }),
            row({
              key: 'wf-failed',
              label: 'Failed in the last 24 hours',
              description: 'Runs that failed, with the reason recorded on each run.',
              state: async (ctx) => {
                const n = await d.prisma.workflowRun.count({ where: { workflow: { businessId: ctx.businessId }, status: 'failed', createdAt: { gte: new Date(ctx.now.getTime() - 86_400_000) } } });
                return { value: n ? `${n} failed` : 'None', tone: n ? 'amber' : 'green' };
              },
            }),
            row({
              key: 'wf-last',
              label: 'Last run',
              description: 'The most recent run of any workflow.',
              state: async (ctx) => {
                const r = await d.prisma.workflowRun.findFirst({ where: { workflow: { businessId: ctx.businessId } }, orderBy: { createdAt: 'desc' } });
                return { value: r ? `${relativeTime(r.createdAt, ctx.now)} · ${r.status}` : 'Never run' };
              },
            }),
          ],
        },
        {
          title: 'Your workflows',
          hint: 'On or off',
          dynamicRows: async (ctx) => {
            const wfs = await d.prisma.workflow.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: 'asc' } });
            if (wfs.length === 0) return [row({ key: 'wf-none', label: 'Workflows', description: 'No workflow has been created yet.', link: { label: 'Create a workflow', href: '/marketing/automations' }, state: () => ({ value: 'None', tone: 'neutral' }) })];
            return wfs.map((w): RowDef =>
              row({
                key: `workflow:${w.id}`,
                label: w.name,
                description: `Runs when: ${w.triggerKey.replace(/_/g, ' ')}.`,
                risk: 'Medium',
                requires: CAPABILITIES.AUTOMATIONS_MANAGE,
                link: { label: 'Edit workflow', href: '/marketing/automations' },
                state: () => ({ value: w.active ? 'On' : 'Off', tone: w.active ? 'green' : 'neutral', control: { type: 'toggle', on: w.active } }),
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
                  await d.prisma.workflow.update({ where: { id: w.id }, data: { active: on } });
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
              description: 'The actions currently supported by the workflow engine.',
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
      description: 'Which AI features are on, how much they may cost, and what AI is allowed to do.',
      affects: ['Every module', 'Marketing', 'Reviews'],
      affectsNote: 'Turning a feature off blocks it for everyone in this business immediately.',
      help: [
        'Owner-only: AI switches and spend limits are billing-adjacent controls.',
        'The assistant’s data tools are read-only. It cannot change a price, refund, balance or permission.',
        'Voice commands only draft a record; nothing is saved until you confirm the draft.',
      ],
      notice: { text: 'AI cannot change prices, refunds, credit, stock or permissions: the assistant only reads, and voice commands are drafts you must confirm.', icon: 'shield-check' },
      actions: [{ label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' }, { label: 'View history', icon: 'history', kind: 'history' }, { label: 'Open AI settings', icon: 'external-link', href: '/assistant/settings', kind: 'link' }],
      groups: [
        {
          title: 'AI status',
          hint: 'Honest about its limits',
          rows: [
            row({
              key: 'ai-available',
              label: 'Availability',
              description: 'Whether an AI provider is configured on this Noxtill installation.',
              state: () => ({ value: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured', tone: process.env.ANTHROPIC_API_KEY ? 'green' : 'red' }),
            }),
            row({
              key: 'ai-usage',
              label: 'Usage this month',
              description: 'AI calls made and their estimated cost this month.',
              state: async (ctx) => {
                const agg = await d.prisma.aiCallLog.aggregate({ where: { businessId: ctx.businessId, createdAt: { gte: monthStart(ctx.now) } }, _count: { _all: true }, _sum: { estimatedCostUsd: true } });
                return { value: `${agg._count._all.toLocaleString('en-US')} calls · $${Number(agg._sum.estimatedCostUsd ?? 0).toFixed(2)}` };
              },
            }),
            row({
              key: 'ai-cap',
              label: 'Monthly cost cap',
              description: 'AI calls are refused once estimated spend this month reaches this amount.',
              risk: 'High',
              impact: 'Lowering the cap can immediately block AI features for the rest of the month.',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              reset: { label: '$5.00', value: 5 },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: `$${Number(b.aiMonthlyCostCapUsd).toFixed(2)}`, control: { type: 'number', current: Number(b.aiMonthlyCostCapUsd), min: 0, max: 100000, step: 0.5, unit: 'USD' } };
              },
              write: async (ctx, v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0) throw bad('Enter a cost of 0 or more.');
                await updateBusiness(d, ctx, { aiMonthlyCostCapUsd: n });
              },
            }),
            row({
              key: 'ai-rate',
              label: 'Calls per minute',
              description: 'The most AI calls this business can make in a minute.',
              risk: 'Medium',
              requires: CAPABILITIES.AI_SETTINGS_MANAGE,
              reset: { label: '10', value: 10 },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: String(b.aiRateLimitPerMinute), control: { type: 'number', current: b.aiRateLimitPerMinute, min: 1, max: 1000, step: 1, unit: 'per minute' } };
              },
              write: async (ctx, v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) throw bad('Enter a whole number of 1 or more.');
                await updateBusiness(d, ctx, { aiRateLimitPerMinute: n });
              },
            }),
          ],
        },
        { title: 'Features', hint: 'Owner controls', rows: AI_FEATURES.map(aiFeatureRow) },
        {
          title: 'Customer contact details',
          hint: 'Enforced in the AI Assistant',
          footer: 'The assistant still sees customer names, spend and visit counts. It does not apply to text you type into the chat yourself, and other AI features are governed by the switches above.',
          rows: [
            policyRow(d, {
              key: 'ai-redact',
              policy: 'ai.redactContacts',
              kind: 'toggle',
              label: 'Hide customer phone and email from the AI Assistant',
              description: 'Phone numbers and email addresses in what the assistant looks up are masked (for example •••4567) before the assistant sees them.',
              risk: 'High',
              impact: 'The assistant can no longer read out a customer’s full contact details.',
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
            row({ key: 'ai-tools', label: 'Assistant data tools', description: 'The assistant looks things up. None of its tools writes data.', risk: 'High', state: () => ({ value: 'Read-only', tone: 'green' }) }),
            row({ key: 'ai-voice', label: 'Voice commands', description: 'Add expense, add customer, record wastage and record cash movement are drafted, then need your confirmation.', risk: 'High', state: () => ({ value: 'Confirmation required', tone: 'green' }) }),
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
      description: 'Connected external services and the real state of each connection.',
      affects: ['Marketing', 'Reviews', 'Reports', 'Unified Inbox'],
      affectsNote: 'A connection that needs attention cannot sync until it is reconnected.',
      help: [
        'States are connected, needs attention or not connected — never a fabricated live badge.',
        'Only services Noxtill can genuinely connect to are listed.',
        'Disconnecting stops syncing; data already synced is kept.',
      ],
      actions: [{ label: 'Open Integrations', icon: 'external-link', primary: true, href: '/integrations', kind: 'link' }],
      groups: [
        {
          title: 'Connected',
          hint: 'Real sync state',
          dynamicRows: async (ctx) => {
            const list = await d.prisma.integration.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } }, orderBy: { provider: 'asc' } });
            if (list.length === 0) return [row({ key: 'int-none', label: 'Connected services', description: 'No integration is connected.', link: { label: 'Connect a service', href: '/integrations' }, state: () => ({ value: 'None', tone: 'neutral' }) })];
            return list.map((i): RowDef =>
              row({
                key: `integration:${i.provider}`,
                label: PROVIDER_LABELS[i.provider] ?? i.provider,
                description: `Connected ${i.connectedAt ? relativeTime(i.connectedAt, ctx.now) : ''}. Last synced ${i.lastSyncAt ? relativeTime(i.lastSyncAt, ctx.now) : 'never'}.`.replace('Connected . ', ''),
                risk: i.status === 'needs_attention' ? 'High' : 'Medium',
                link: { label: 'Open integration', href: '/integrations' },
                state: () => ({ value: i.status === 'connected' ? 'Connected' : 'Needs attention', tone: i.status === 'connected' ? 'green' : 'amber' }),
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
              description: 'Services Noxtill can connect to that you have not connected.',
              link: { label: 'Browse integrations', href: '/integrations' },
              state: async (ctx) => {
                const connected = await d.prisma.integration.count({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } } });
                return { value: `${Math.max(0, Object.values(IntegrationProvider).length - connected)} available` };
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
      description: 'Keys, scopes and event endpoints for connecting your own systems.',
      affects: ['Integrations', 'Every module'],
      affectsNote: 'An API key can read whatever its scopes allow, so scope is the real security boundary.',
      help: [
        'A key’s secret is shown once at creation and never again. Revoke and recreate rather than recover.',
        'Webhook deliveries record their response and status so failures are diagnosable.',
        'Revoking a key takes effect immediately and breaks anything using it.',
      ],
      actions: [{ label: 'Manage keys and webhooks', icon: 'external-link', primary: true, href: '/settings/tools/developer', kind: 'link' }, { label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'API keys',
          hint: 'Scope is the security boundary',
          dynamicRows: async (ctx) => {
            const keys = await d.prisma.apiKey.findMany({ where: { businessId: ctx.businessId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
            if (keys.length === 0) return [row({ key: 'api-none', label: 'Active keys', description: 'No API key is active.', link: { label: 'Create a key', href: '/settings/tools/developer' }, state: () => ({ value: 'None', tone: 'neutral' }) })];
            return keys.map((k): RowDef =>
              row({
                key: `apikey:${k.id}`,
                label: `Key · ${k.name}`,
                description: `${k.keyPrefix}… · ${plural(((k.scopes as unknown as string[]) ?? []).length, 'scope')} · last used ${k.lastUsedAt ? relativeTime(k.lastUsedAt, ctx.now) : 'never'}.`,
                risk: 'High',
                requires: CAPABILITIES.INTEGRATIONS_MANAGE,
                impact: 'Revoking takes effect at once and breaks anything currently using the key. There is no grace period.',
                state: () => ({ value: 'Revoke', tone: 'neutral', control: { type: 'action', label: 'Revoke', actionKey: `apikey:${k.id}`, tone: 'red', confirm: 'Anything using this key stops working immediately.' } }),
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
                const [on, off] = await Promise.all([d.prisma.outboundWebhook.count({ where: { businessId: ctx.businessId, active: true } }), d.prisma.outboundWebhook.count({ where: { businessId: ctx.businessId, active: false } })]);
                return { value: `${on} active${off ? ` · ${off} off` : ''}` };
              },
            }),
            row({
              key: 'wh-failed',
              label: 'Failed deliveries',
              description: 'Deliveries that failed after all attempts in the last 24 hours.',
              state: async (ctx) => {
                const n = await d.prisma.outboundWebhookDelivery.count({ where: { webhook: { businessId: ctx.businessId }, status: 'failed', lastAttemptAt: { gte: new Date(ctx.now.getTime() - 86_400_000) } } });
                return { value: n ? `${n} failed` : 'None', tone: n ? 'amber' : 'green' };
              },
            }),
            row({ key: 'wh-retry', label: 'Retry policy', description: 'How a failed delivery is retried.', state: () => ({ value: '5 attempts · exponential backoff' }) }),
            row({ key: 'wh-signature', label: 'Signature', description: 'Every delivery is signed so you can verify it came from Noxtill.', state: () => ({ value: 'HMAC-SHA256', tone: 'green' }) }),
          ],
        },
      ],
    },
  ];
}
