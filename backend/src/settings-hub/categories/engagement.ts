import { HttpStatus } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubCtx, HubValue, row, RowDef, plural, relativeTime } from '../hub.core';
import { HubDeps, asJson, business, updateBusiness } from './hub.deps';
import { TEMPLATE_REGISTRY } from '../../messaging/templates/template-registry.data';
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_LABELS, NOTIFICATION_EVENT_PRIORITY } from '../../notifications/notification-preferences.constants';
import { policyRow } from './policy-rows';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

async function reviewSettings(d: HubDeps, ctx: HubCtx): Promise<Record<string, unknown>> {
  const b = await business(d, ctx);
  return (b.reviewSettings ?? {}) as Record<string, unknown>;
}

async function patchReviewSettings(d: HubDeps, ctx: HubCtx, patch: Record<string, unknown>) {
  const current = await reviewSettings(d, ctx);
  const next: Record<string, unknown> = { ...current, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await updateBusiness(d, ctx, { reviewSettings: asJson(next) });
}

export async function notificationMatrix(d: HubDeps, ctx: HubCtx) {
  const matrix = await d.notifications.getPreferenceMatrix(ctx.businessId, ctx.userId);
  const channels = [
    { key: 'in_app', label: 'In-app', available: true, reason: null as string | null },
    { key: 'email', label: 'Email', available: false, reason: 'Internal notifications are delivered in the app inbox only.' },
    { key: 'whatsapp', label: 'WhatsApp', available: false, reason: 'Internal notifications are delivered in the app inbox only.' },
    { key: 'sms', label: 'SMS', available: false, reason: 'Internal notifications are delivered in the app inbox only.' },
  ];
  return {
    channels,
    rows: NOTIFICATION_EVENTS.map((event) => ({
      event,
      label: NOTIFICATION_EVENT_LABELS[event],
      priority: NOTIFICATION_EVENT_PRIORITY[event],
      cells: channels.map((c) => {
        const m = matrix.find((x) => x.event === event && x.channel === c.key);
        return { channel: c.key, on: c.available ? (m?.enabled ?? true) : false, blocked: !c.available };
      }),
      locked: false,
    })),
  };
}

export function engagementCategories(d: HubDeps): CategoryDef[] {
  const aiToggleRow = (): RowDef =>
    row({
      key: 'ai-review-replies',
      label: 'AI reply drafts',
      description: 'Lets AI write a draft reply to a review. A draft is never posted on its own — a person always sends it.',
      risk: 'Medium',
      requires: CAPABILITIES.AI_SETTINGS_MANAGE,
      reset: { label: 'On', value: true },
      state: async (ctx) => {
        const b = await business(d, ctx);
        const toggles = (b.aiFeatureToggles ?? {}) as Record<string, boolean>;
        const on = toggles.reviewReplies !== false;
        return { value: on ? 'On' : 'Off', tone: on ? 'green' : 'neutral', control: { type: 'toggle', on } };
      },
      write: async (ctx, v: HubValue) => {
        const b = await business(d, ctx);
        const toggles = { ...((b.aiFeatureToggles ?? {}) as Record<string, boolean>), reviewReplies: Boolean(v) };
        await updateBusiness(d, ctx, { aiFeatureToggles: asJson(toggles) });
      },
    });

  return [
    {
      key: 'marketing',
      label: 'Marketing',
      title: 'Marketing',
      icon: 'megaphone',
      group: 'Engagement',
      description: 'The limits every marketing message respects, and how much messaging your plan allows.',
      affects: ['Marketing', 'Customers', 'Automations', 'Reports'],
      affectsNote: 'Opt-outs, the message quota and the frequency cap stop a send. Quiet hours do not stop it — they hold it until the window ends.',
      help: [
        'Campaign audiences always exclude customers who opted out.',
        'Sends stop when the monthly message quota is used up.',
        'The frequency cap counts marketing messages already sent to that customer in the period; a customer at the cap is skipped, not queued.',
        'During quiet hours a marketing message is held and sent when the window ends, in your business timezone. Reminders, receipts and other non-marketing messages are not held.',
      ],
      actions: [{ label: 'Open Marketing', icon: 'external-link', href: '/marketing', kind: 'link' }],
      groups: [
        {
          title: 'Hard limits',
          hint: 'Enforced on every send',
          rows: [
            row({ key: 'mk-optout', label: 'Opted-out customers', description: 'Customers who opted out are excluded from every campaign audience.', risk: 'High', state: () => ({ value: 'Always excluded', tone: 'green' }) }),
            row({
              key: 'mk-quota',
              label: 'Monthly message quota',
              description: 'Customer messages sent against your plan’s quota.',
              link: { label: 'Manage plan', href: '/settings/tools/billing' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const pct = b.msgQuota ? Math.round((b.msgUsed / b.msgQuota) * 100) : 0;
                return { value: `${b.msgUsed.toLocaleString('en-US')} of ${b.msgQuota.toLocaleString('en-US')}`, tone: pct >= 90 ? 'amber' : 'neutral' };
              },
            }),
          ],
        },
        {
          title: 'Frequency and quiet hours',
          hint: 'Applied to every marketing message',
          footer: 'These apply to campaigns and to marketing automations alike, because both go through the same send check.',
          rows: [
            policyRow(d, { key: 'mk-freq-max', policy: 'marketing.frequencyCapMax', kind: 'number', label: 'Messages per customer', description: 'The most marketing messages one customer may be sent in the period below. Empty means no cap.', requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE, risk: 'Medium', unit: 'messages', format: (n) => `${n} message${n === 1 ? '' : 's'}`, emptyLabel: 'No cap' }),
            policyRow(d, { key: 'mk-freq-days', policy: 'marketing.frequencyCapDays', kind: 'number', label: 'Cap period', description: 'The rolling number of days the cap is counted over.', requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE, unit: 'days', format: (n) => `${n} day${n === 1 ? '' : 's'}` }),
            policyRow(d, { key: 'mk-quiet-from', policy: 'marketing.quietFrom', kind: 'time', label: 'Quiet hours start', description: 'No marketing message goes out from this time, in your business timezone. Set both times to use quiet hours.', requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE, emptyLabel: 'Not set' }),
            policyRow(d, { key: 'mk-quiet-to', policy: 'marketing.quietTo', kind: 'time', label: 'Quiet hours end', description: 'Held marketing messages are sent from this time. The window may run past midnight, for example 21:00 to 08:00.', requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE, emptyLabel: 'Not set' }),
          ],
        },
        {
          title: 'Activity',
          hint: 'Last 30 days',
          rows: [
            row({
              key: 'mk-campaigns',
              label: 'Campaigns',
              description: 'Campaigns created in the last 30 days.',
              state: async (ctx) => ({ value: plural(await d.prisma.campaign.count({ where: { businessId: ctx.businessId, createdAt: { gte: new Date(ctx.now.getTime() - 30 * 86_400_000) } } }), 'campaign') }),
            }),
          ],
        },
      ],
    },
    {
      key: 'reviews',
      label: 'Reviews & Reputation',
      title: 'Reviews & Reputation',
      icon: 'star',
      group: 'Engagement',
      description: 'When customers are asked for a review, where happy customers are sent, and how replies are drafted.',
      affects: ['Reviews', 'Customers', 'Notifications'],
      affectsNote: 'Review request rules decide who is asked and when — they never decide what a customer is asked to say.',
      help: [
        'The first review request goes out two hours after a sale; follow-up reminders use the days below.',
        'Noxtill drafts replies but never posts one without a person sending it.',
        'The review link a customer receives expires after 30 days.',
      ],
      actions: [{ label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' }, { label: 'View history', icon: 'history', kind: 'history' }, { label: 'Open Reviews', icon: 'external-link', href: '/reviews', kind: 'link' }],
      groups: [
        {
          title: 'Review requests',
          hint: 'Timing and destination',
          rows: [
            row({
              key: 'rv-platform',
              label: 'Public review platform',
              description: 'Where customers who rate you highly are sent to leave a public review.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              reset: { label: 'Google', value: 'google' },
              state: async (ctx) => {
                const s = await reviewSettings(d, ctx);
                const cur = (s.publicReviewPlatform as string) ?? 'google';
                return { value: cur[0].toUpperCase() + cur.slice(1), control: { type: 'select', current: cur, options: ['google', 'facebook', 'yelp', 'other'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) } };
              },
              write: async (ctx, v) => {
                if (!['google', 'facebook', 'yelp', 'other'].includes(String(v))) throw bad('Choose a review platform.');
                await patchReviewSettings(d, ctx, { publicReviewPlatform: String(v) });
              },
            }),
            row({
              key: 'rv-offsets',
              label: 'Reminder days',
              description: 'Days after the first request that a reminder is sent to customers who have not responded. Comma-separated, 1–30.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              reset: { label: '3, 7', value: '3,7' },
              state: async (ctx) => {
                const s = await reviewSettings(d, ctx);
                const offs = Array.isArray(s.reminderDayOffsets) ? (s.reminderDayOffsets as number[]) : [3, 7];
                return { value: offs.length ? `Day ${offs.join(', ')}` : 'No reminders', control: { type: 'text', current: offs.join(','), placeholder: '3,7', maxLength: 40 } };
              },
              write: async (ctx, v) => {
                const parts = String(v).split(',').map((x) => x.trim()).filter(Boolean).map(Number);
                if (parts.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) throw bad('Enter whole days from 1 to 30, separated by commas.');
                await patchReviewSettings(d, ctx, { reminderDayOffsets: [...new Set(parts)].sort((a, b) => a - b) });
              },
            }),
            row({
              key: 'rv-video',
              label: 'Video testimonial invitation',
              description: 'When a customer is invited to leave a video testimonial.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              reset: { label: 'Manual', value: 'manual' },
              state: async (ctx) => {
                const s = await reviewSettings(d, ctx);
                const cur = (s.videoTestimonialTrigger as string) ?? 'manual';
                const labels: Record<string, string> = { manual: 'Manual only', four_star_plus: '4 stars and above', five_star: '5 stars only' };
                return { value: labels[cur] ?? cur, control: { type: 'select', current: cur, options: Object.entries(labels).map(([value, label]) => ({ value, label })) } };
              },
              write: async (ctx, v) => {
                if (!['manual', 'four_star_plus', 'five_star'].includes(String(v))) throw bad('Choose when to invite a video testimonial.');
                await patchReviewSettings(d, ctx, { videoTestimonialTrigger: String(v) });
              },
            }),
            row({
              key: 'rv-color',
              label: 'Review page colour',
              description: 'Accent colour on your public review page, as a hex code.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              state: async (ctx) => {
                const s = await reviewSettings(d, ctx);
                const cur = (s.brandColor as string) ?? '';
                return { value: cur || 'Default', control: { type: 'text', current: cur, placeholder: '#12A150', maxLength: 7 } };
              },
              write: async (ctx, v) => {
                const c = String(v).trim();
                if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw bad('Enter a colour like #12A150.');
                await patchReviewSettings(d, ctx, { brandColor: c || undefined });
              },
            }),
            row({ key: 'rv-first', label: 'First request timing', description: 'When the first review request goes out after a sale.', state: () => ({ value: '2 hours after the sale' }) }),
            row({ key: 'rv-expiry', label: 'Review link expiry', description: 'How long a customer’s review link works.', state: () => ({ value: '30 days' }) }),
          ],
        },
        {
          title: 'Replies',
          hint: 'A person always sends',
          rows: [aiToggleRow()],
          footer: 'A reply is drafted for you to edit and send. Noxtill never posts one automatically.',
        },
      ],
    },
    {
      key: 'inbox',
      label: 'Unified Inbox',
      title: 'Unified Inbox',
      icon: 'message-circle',
      group: 'Engagement',
      description: 'Which social channels are connected. A channel that is not connected cannot send or receive.',
      affects: ['Unified Inbox', 'Marketing', 'Notifications'],
      affectsNote: 'Channel authorisation state decides whether anything can send at all.',
      help: [
        'A channel needing attention cannot send, and Noxtill says so rather than queueing silently.',
        'Routing, auto-reply and inbox business hours are not part of this version.',
        'AI never sends a customer message on its own.',
      ],
      actions: [{ label: 'Open Inbox', icon: 'external-link', href: '/social/inbox', kind: 'link' }],
      groups: [
        {
          title: 'Channel connections',
          hint: 'Real state only',
          dynamicRows: async (ctx) => {
            const accounts = await d.prisma.socialAccount.findMany({ where: { businessId: ctx.businessId }, orderBy: { platform: 'asc' } });
            if (accounts.length === 0) return [row({ key: 'inbox-none', label: 'Social channels', description: 'No social channel has been connected yet.', link: { label: 'Connect a channel', href: '/social' }, state: () => ({ value: 'None connected', tone: 'neutral' }) })];
            return accounts.map((a): RowDef =>
              row({
                key: `social:${a.platform}`,
                label: a.platform[0].toUpperCase() + a.platform.slice(1),
                description: a.externalAccountName ? `Account: ${a.externalAccountName}.` : 'No account name recorded.',
                risk: a.status === 'needs_attention' ? 'High' : 'Low',
                link: { label: 'Manage channels', href: '/social' },
                state: () => ({ value: a.status === 'connected' ? 'Connected' : a.status === 'needs_attention' ? 'Needs attention' : 'Not connected', tone: a.status === 'connected' ? 'green' : a.status === 'needs_attention' ? 'amber' : 'neutral' }),
              }),
            );
          },
        },
        {
          title: 'Replies',
          hint: 'What is and is not available',
          rows: [
            row({ key: 'inbox-auto', label: 'Auto-reply', description: 'Automatic replies outside business hours.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
            row({ key: 'inbox-ai', label: 'AI replies', description: 'AI drafting a reply to a social message. Every reply here is typed and sent by a person; this is different from the AI review-reply drafts in Reviews.', state: () => ({ value: 'Not available', tone: 'neutral' }) }),
          ],
        },
      ],
    },
    {
      key: 'notifications',
      label: 'Notifications',
      title: 'Notifications',
      icon: 'bell',
      group: 'Engagement',
      description: 'The internal alerts Noxtill sends you, and when the nightly summary goes out.',
      affects: ['Every module', 'In-app'],
      affectsNote: 'Only alerts Noxtill actually sends are listed, and only the in-app inbox delivers them.',
      help: [
        'Each row is an alert Noxtill really fires today — none are invented.',
        'Turning an alert off only affects you; each team member controls their own.',
        'Email, WhatsApp and SMS are used for customer messages, not internal alerts.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      matrix: (ctx) => notificationMatrix(d, ctx),
      groups: [
        {
          title: 'Nightly close',
          hint: 'A daily summary of the day',
          rows: [
            row({
              key: 'nightly-time',
              label: 'Nightly close time',
              description: 'When the daily summary is composed and sent, in your timezone.',
              requires: CAPABILITIES.NIGHTLY_CLOSE_MANAGE,
              reset: { label: '22:00', value: '22:00' },
              link: { label: 'Choose what it includes', href: '/settings/tools/nightly-close' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.nightlyCloseTime, control: { type: 'time', current: b.nightlyCloseTime } };
              },
              write: async (ctx, v) => {
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw bad('Enter a time like 22:00.');
                await updateBusiness(d, ctx, { nightlyCloseTime: String(v) });
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'communication',
      label: 'Email · SMS · WhatsApp',
      title: 'Email · SMS · WhatsApp',
      icon: 'mail',
      group: 'Engagement',
      description: 'How customer messages are routed, and how much messaging your plan allows.',
      affects: ['Bookings', 'Credit', 'Marketing', 'Reviews', 'Reports'],
      affectsNote: 'Routing decides which channel a customer message uses; opt-outs and your monthly quota always apply.',
      help: [
        'A customer is messaged on the first channel in the order below that they can receive.',
        'Opt-outs are honoured across every channel at once.',
        'Message wording is edited in the message editor, per template and language.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }, { label: 'Open message editor', icon: 'external-link', href: '/settings/tools/messages', kind: 'link' }],
      groups: [
        {
          title: 'Routing',
          hint: 'Where customer messages go',
          rows: [
            row({
              key: 'comm-pref',
              label: 'Preferred channel',
              description: 'The channel tried first when a customer has no preference of their own.',
              requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE,
              reset: { label: 'WhatsApp', value: 'whatsapp' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const labels: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
                return { value: labels[b.channelPref], control: { type: 'select', current: b.channelPref, options: Object.entries(labels).map(([value, label]) => ({ value, label })) } };
              },
              write: async (ctx, v) => {
                if (!['whatsapp', 'sms', 'email'].includes(String(v))) throw bad('Choose a channel.');
                await updateBusiness(d, ctx, { channelPref: String(v) as MessageChannel });
              },
            }),
            row({
              key: 'comm-order',
              label: 'Fallback order',
              description: 'The order channels are tried when the first cannot reach a customer.',
              link: { label: 'Edit order', href: '/settings/tools/messages' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const p = (b.channelPriority as unknown as string[]) ?? [];
                return { value: (p.length ? p : ['whatsapp', 'sms', 'email']).join(' → ') };
              },
            }),
            row({
              key: 'comm-quota',
              label: 'Monthly message quota',
              description: 'Messages sent against your plan’s quota.',
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: `${b.msgUsed.toLocaleString('en-US')} of ${b.msgQuota.toLocaleString('en-US')}`, tone: b.msgQuota && b.msgUsed / b.msgQuota >= 0.9 ? 'amber' : 'neutral' };
              },
            }),
          ],
        },
        {
          title: 'WhatsApp approval',
          hint: 'Enforced when a message is sent',
          footer: 'A template not marked Approved is never sent over WhatsApp. The customer is reached on the next channel they can receive, or the send is refused if there is none. A template you have not marked counts as Approved.',
          rows: Object.values(TEMPLATE_REGISTRY).map((def): RowDef =>
            row({
              key: `tpl:${def.key}`,
              label: def.key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
              description: `${def.category === 'marketing' ? 'Marketing' : 'Transactional'} template. Whether it may be sent over WhatsApp.`,
              requires: CAPABILITIES.MESSAGING_CHANNELS_MANAGE,
              risk: 'Medium',
              reset: { label: 'Approved', value: 'approved' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const status = ((b.templateApprovals ?? {}) as Record<string, { status?: string }>)[def.key]?.status ?? 'approved';
                const labels: Record<string, string> = { approved: 'Approved', pending: 'Pending', rejected: 'Rejected' };
                return { value: labels[status] ?? status, tone: status === 'approved' ? 'green' : status === 'pending' ? 'amber' : 'red', control: { type: 'select', current: status, options: Object.entries(labels).map(([value, label]) => ({ value, label })) } };
              },
              write: async (ctx, v) => {
                if (!['approved', 'pending', 'rejected'].includes(String(v))) throw bad('Choose Approved, Pending or Rejected.');
                const b = await business(d, ctx);
                const next = { ...((b.templateApprovals ?? {}) as Record<string, unknown>), [def.key]: { status: String(v) } };
                await updateBusiness(d, ctx, { templateApprovals: asJson(next) });
              },
            }),
          ),
        },
        {
          title: 'Templates',
          hint: 'Edited in the message editor',
          rows: [
            row({
              key: 'comm-templates',
              label: 'Message templates',
              description: 'The templates Noxtill sends for bookings, receipts, credit, reviews and reports.',
              link: { label: 'Open message editor', href: '/settings/tools/messages' },
              state: () => ({ value: plural(Object.keys(TEMPLATE_REGISTRY).length, 'template') }),
            }),
          ],
        },
      ],
    },
  ];
}

void relativeTime;
