import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CAPABILITIES,
  SYSTEM_ROLE_CAPABILITIES,
  type Capability,
} from '../common/capabilities/capabilities.constants';

export interface PermissionRow {
  action: string;
  owner: boolean;
  manager: boolean;
  staff: boolean;
}

/**
 * Each row's `capabilities` is empty for an action this codebase genuinely never gates (open to
 * any authenticated user — verified against the real controllers, not assumed): campaign sending
 * (`CampaignsController`/`EmailCampaignsController` have no `@RequireCapability`) and reading
 * analytics/audiences/channels (`OverviewController`/`SegmentsController` GETs/`content-items`
 * GET are all unguarded). Every other row is computed straight from `SYSTEM_ROLE_CAPABILITIES` —
 * the same map `RolesGuard` reads at request time — so if a capability's tier ever changes, this
 * table changes with it instead of silently drifting out of sync.
 */
const ACTION_ROWS: { action: string; capabilities: Capability[] }[] = [
  { action: 'Send a campaign (WhatsApp or Email)', capabilities: [] },
  { action: 'Create or change an automation', capabilities: [CAPABILITIES.AUTOMATIONS_MANAGE] },
  {
    action: 'Create or change a coupon/voucher',
    capabilities: [CAPABILITIES.COUPONS_MANAGE, CAPABILITIES.VOUCHERS_MANAGE],
  },
  { action: 'Create or edit content planner items', capabilities: [CAPABILITIES.CONTENT_PLANNER_MANAGE] },
  { action: 'View analytics, audiences and channels', capabilities: [] },
];

/**
 * Policy facts that describe fixed code behavior rather than a stored, editable setting — there
 * is nothing to fetch because there is no value; the description below IS the behavior. Kept here
 * (in the backend, next to the modules it describes) rather than duplicated in the frontend, so a
 * change to that behavior and a change to its description live in the same file.
 */
const POLICY_GROUPS: { group: string; rows: { label: string; value: string }[] }[] = [
  {
    group: 'Communication',
    rows: [
      {
        label: 'Respect opt-out',
        // Real guarantee: SegmentsService/CampaignsService always resolve members via
        // `rulesToWhere`/`getSegment` and filter `!optedOut` before a send — there is no code
        // path that skips this.
        value: 'Always on — cannot be disabled, enforced on every send',
      },
    ],
  },
  {
    group: 'AI',
    rows: [
      { label: 'AI may draft content', value: 'Yes — content ideas & AI reallocation suggestions' },
      { label: 'AI may suggest audiences', value: 'Yes — AI persona naming for audiences' },
      // Real guarantee: no AI-authored text is ever passed straight to a send-gate call anywhere
      // in this codebase — every AI output lands in a form field a person must submit.
      { label: 'AI may send without approval', value: 'Never' },
      { label: 'AI must show its evidence', value: 'Always — grounded in your real sales, reviews and channel data' },
    ],
  },
  {
    group: 'Attribution',
    rows: [
      // Matches MarketingOverviewService.overview(): redemptions/revenue are scoped to
      // Order.couponId/voucherId, nothing else.
      { label: 'Attribution scope', value: 'Orders/bookings that used a real coupon or voucher' },
      { label: 'Conversion counts when', value: 'Payment confirms' },
      { label: 'Model', value: 'Not multi-touch — no per-campaign click tracking joined to orders' },
    ],
  },
  {
    group: 'Messaging',
    rows: [
      // Matches CampaignsService.create(): blocked by `business.msgQuota - business.msgUsed`.
      { label: 'WhatsApp sends', value: 'Gated by your monthly message quota' },
      // Matches EmailCampaignsService.create(): filtered by `isSuppressed`, no quota involved.
      { label: 'Email sends', value: 'Gated by your real unsubscribe/suppression list, not quota' },
    ],
  },
];

@Injectable()
export class MarketingSettingsService {
  get() {
    return {
      groups: POLICY_GROUPS,
      permissions: this.buildPermissionRows(),
    };
  }

  private buildPermissionRows(): PermissionRow[] {
    const has = (role: Role, capabilities: Capability[]) =>
      capabilities.every((c) => SYSTEM_ROLE_CAPABILITIES[role].includes(c));

    return ACTION_ROWS.map(({ action, capabilities }) => ({
      action,
      owner: has(Role.owner, capabilities),
      manager: has(Role.manager, capabilities),
      staff: has(Role.staff, capabilities),
    }));
  }
}
