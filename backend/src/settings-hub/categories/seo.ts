import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, row } from '../hub.core';
import { HubDeps } from './hub.deps';
import { policyRow } from './policy-rows';

const SEO = CAPABILITIES.SEO_MANAGE;

/**
 * Settings → SEO Autopilot (SEO Autopilot screen 16's editable rules). Every editable row is a real
 * `Business.policies` key with a consumer in the SEO services; the read-only rows state fixed
 * behaviour and data sources that genuinely aren't connected.
 */
export function seoCategories(d: HubDeps): CategoryDef[] {
  return [
    {
      key: 'seo',
      label: 'SEO Autopilot',
      title: 'SEO Autopilot',
      icon: 'sparkles',
      group: 'Intelligence',
      description:
        'How much SEO Autopilot may do on its own, and the thresholds behind its recommendations.',
      affects: ['SEO Autopilot'],
      affectsNote:
        'Every SEO change still needs approval and is applied by you on your own site — these settings never let Noxtill publish to your website.',
      help: [
        'Turning AI drafts off removes AI suggestions everywhere in SEO Autopilot; drafts already created stay.',
        'Thresholds change which items are flagged, never your data.',
        'Search Console, analytics and backlink providers are not connected, so those figures show as not tracked.',
      ],
      actions: [
        {
          label: 'Open SEO Autopilot',
          icon: 'external-link',
          href: '/marketing/seo-autopilot/settings',
          kind: 'link',
        },
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Autopilot permissions',
          hint: 'What the SEO agent may do',
          rows: [
            policyRow(d, {
              key: 'seo-ai-drafts',
              policy: 'seo.aiDraftsEnabled',
              kind: 'toggle',
              label: 'Allow AI drafts',
              description:
                'Lets SEO Autopilot write draft page metadata, content briefs and content drafts with AI. Drafts are never applied without approval.',
              risk: 'Medium',
              requires: SEO,
              impact:
                'When off, SEO Autopilot only observes and reports (level L0); people write every proposal themselves.',
              on: { text: 'L1 · AI drafts allowed', tone: 'blue' },
              off: { text: 'L0 · Observe only', tone: 'neutral' },
            }),
            row({
              key: 'seo-approval',
              label: 'Approval before changes',
              description:
                'Every page, technical and content change needs approval, and is applied by you on your site. Auto-applying changes (levels L3–L4) is not available.',
              state: () => ({ value: 'Always required', tone: 'green' }),
            }),
          ],
        },
        {
          title: 'Content rules',
          hint: 'When content is flagged',
          rows: [
            policyRow(d, {
              key: 'seo-improve-below',
              policy: 'seo.improveBelowRank',
              kind: 'number',
              label: 'Flag pages ranking worse than',
              description:
                'A tracked keyword whose page ranks below this position (or not at all) becomes an “improve page” opportunity in Content SEO.',
              requires: SEO,
              unit: 'position',
              format: (n) => `#${n}`,
            }),
            policyRow(d, {
              key: 'seo-refresh-drop',
              policy: 'seo.refreshDropPositions',
              kind: 'number',
              label: 'Refresh due after a drop of',
              description:
                'Published content is marked refresh due when its keyword falls this many places from where it ranked when published.',
              requires: SEO,
              unit: 'places',
              format: (n) => `${n} place${n === 1 ? '' : 's'}`,
            }),
          ],
        },
        {
          title: 'Data sources',
          hint: 'Connected or not',
          rows: [
            row({
              key: 'seo-rank-provider',
              label: 'Rank checks',
              description:
                'Search positions for tracked keywords come from SerpApi, configured on the server.',
              state: () =>
                process.env.SERPAPI_KEY?.trim()
                  ? { value: 'Configured', tone: 'green' }
                  : { value: 'Not configured', tone: 'amber' },
            }),
            row({
              key: 'seo-search-console',
              label: 'Google Search Console',
              description:
                'Clicks, impressions and indexing data. No connector exists yet.',
              state: () => ({ value: 'Not connected', tone: 'neutral' }),
            }),
            row({
              key: 'seo-outreach-identity',
              label: 'Outreach identity',
              description:
                'Noxtill does not send SEO outreach emails; your team sends them and records the result.',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
          ],
        },
      ],
    },
  ];
}
