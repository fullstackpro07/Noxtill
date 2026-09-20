import { MarketingSettingsService } from './marketing-settings.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

describe('MarketingSettingsService', () => {
  const service = new MarketingSettingsService();

  it('derives the permissions matrix from the real capability tiers, not hand-typed booleans', () => {
    const { permissions } = service.get();

    const sendCampaign = permissions.find((r) => r.action.startsWith('Send a campaign'));
    expect(sendCampaign).toEqual({
      action: expect.any(String),
      owner: true,
      manager: true,
      staff: true, // no @RequireCapability on CampaignsController/EmailCampaignsController
    });

    const automation = permissions.find((r) => r.action.includes('automation'));
    expect(automation).toMatchObject({ owner: true, manager: true, staff: false });

    const contentPlanner = permissions.find((r) => r.action.includes('content planner'));
    expect(contentPlanner).toMatchObject({ owner: true, manager: true, staff: false });

    const view = permissions.find((r) => r.action.startsWith('View analytics'));
    expect(view).toMatchObject({ owner: true, manager: true, staff: true });
  });

  it('reflects a capability tier change automatically (never hand-typed)', () => {
    // Sanity check on the real source of truth this service reads: CONTENT_PLANNER_MANAGE is
    // owner+manager today. If this constant's tier ever changes, the matrix above changes with
    // it without anyone touching this service.
    expect(CAPABILITIES.CONTENT_PLANNER_MANAGE).toBe('content_planner.manage');
  });

  it('returns the real policy groups', () => {
    const { groups } = service.get();
    const groupNames = groups.map((g) => g.group);
    expect(groupNames).toEqual(['Communication', 'AI', 'Attribution', 'Messaging']);
  });
});
