import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { HUB_CATALOG } from '../../integrations/hub/hub.catalog';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural, relativeTime } from '../hub.core';
import { HubDeps, asJson, business, monthStart, updateBusiness } from './hub.deps';
import { policyRow } from './policy-rows';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

const AI_FEATURES: { key: string; label: string; description: string }[] = [
  { key: 'assistant', label: 'Business assistant', description: 'The chat assistant that answers questions from your data.' },
  { key: 'insights', label: 'AI insights', description: 'Suggestions shown on the dashboard and Business Brain.' },
  { key: 'whatIf', label: 'What-if simulations', description: 'Scenario estimates built from your recorded data.' },
  { key: 'reviewReplies', label: 'Review reply drafts', description: 'Drafts a reply to a review for a person to send.' },
  { key: 'campaignCopy', label: 'Campaign copy', description: 'Drafts marketing message copy for a person to approve.' },
  { key: 'voiceEntry', label: 'Voice entry', description: 'Turns a spoken command into a draft you confirm before anything is saved.' },
  { key: 'photoDigitizer', label: 'Photo digitizer', description: 'Reads a photo of a list into rows you review before importing.' },
];

/** Provider display names — one source, the Integrations catalog, so this screen never lags the directory. */
const PROVIDER_LABELS: Record<string, string> = {
  ...Object.fromEntries(HUB_CATALOG.filter((p) => p.source.type === 'integration').map((p) => [p.key, p.name])),
  developer: 'Developer API',
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
      key: 'automations',
      label: 'Automations',
      title: 'Automations',
      icon: 'workflow',
      group: 'Intelligence',
      description: 'Your workflows, whether they are running, and what happened when they last ran.',
      affects: ['Bookings', 'Credit', 'Marketing', 'Reviews', 'Inventory'],
      affectsNote: 'Turning a workflow off stops it firing for new events; past runs are kept.',
      help: [
        'A failed run is recorded with its reason. Failures are not retried automatically.',
        'Workflows are event-driven: they run when the event happens, not on their own schedule.',
        'Workflow actions are limited to messaging a customer or notifying you.',
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
                write: async (_ctx, v) => {
                  await d.prisma.workflow.update({ where: { id: w.id }, data: { active: Boolean(v) } });
                },
              }),
            );
          },
        },
        {
          title: 'Safety',
          hint: 'Fixed behaviour',
          rows: [
            row({ key: 'wf-retry', label: 'Failed runs', description: 'A failed run is recorded and is not retried.', state: () => ({ value: 'Recorded, not retried' }) }),
            row({ key: 'wf-actions', label: 'What a workflow can do', description: 'The actions a workflow may take.', state: () => ({ value: 'Message a customer · Notify you' }) }),
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
        'A paused connection stays authorised but does not sync; disconnecting stops syncing too. Data already synced is kept either way.',
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
                state: () => ({
                  value: i.pausedAt ? 'Paused' : i.status === 'connected' ? 'Connected' : 'Needs attention',
                  tone: i.pausedAt ? 'neutral' : i.status === 'connected' ? 'green' : 'amber',
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
              description: 'Services Noxtill can connect to that you have not connected.',
              link: { label: 'Browse integrations', href: '/integrations' },
              state: async (ctx) => {
                const [integrations, social] = await Promise.all([
                  d.prisma.integration.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } }, select: { provider: true } }),
                  d.prisma.socialAccount.findMany({ where: { businessId: ctx.businessId, status: { in: ['connected', 'needs_attention'] } }, select: { platform: true } }),
                ]);
                const taken = new Set<string>([...integrations.map((i) => i.provider), ...social.map((s) => s.platform)]);
                return { value: `${HUB_CATALOG.filter((p) => !taken.has(p.key)).length} available` };
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
      affectsNote: 'An API key acts with the access any signed-in staff member has, plus the capabilities you grant it. Capabilities that erase data, change billing or roles, or write off money can never be granted to a key.',
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
