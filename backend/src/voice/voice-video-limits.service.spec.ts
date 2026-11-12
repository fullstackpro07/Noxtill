import { VoiceVideoLimitsService } from './voice-video-limits.service';

/** Plan rules only; the allowance arithmetic itself is MetersService's (covered by its own specs). */
describe('VoiceVideoLimitsService', () => {
  const build = (
    limits: Record<string, number | null>,
    planName = 'Professional',
    status = 'active',
  ) => {
    const assertAllowance = jest.fn(() => Promise.resolve());
    const entitlements = {
      rootId: () => Promise.resolve('root'),
      ensureSubscription: () =>
        Promise.resolve({ status, plan: { name: planName } }),
      includedFor: (_sub: unknown, metric: string) => limits[metric] ?? null,
    };
    const svc = new VoiceVideoLimitsService(
      entitlements as never,
      { assertAllowance } as never,
    );
    return { svc, assertAllowance };
  };

  it('refuses video entirely on plans that do not include it', async () => {
    const { svc, assertAllowance } = build(
      { video_minutes: 0, video_participants: 0 },
      'Growth',
    );
    await expect(svc.assertCanJoin('b', 'host:1', [])).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FEATURE_NOT_IN_PLAN',
      }) as unknown,
    });
    expect(assertAllowance).not.toHaveBeenCalled();
  });

  it('checks the monthly minute allowance on included plans', async () => {
    const { svc, assertAllowance } = build({
      video_minutes: 2000,
      video_participants: 25,
    });
    await svc.assertCanJoin('b', 'guest:a', ['host:1']);
    expect(assertAllowance).toHaveBeenCalledWith('b', 'video_minutes');
  });

  it('blocks a new participant once the meeting is at the plan cap', async () => {
    const { svc } = build({ video_minutes: 2000, video_participants: 2 });
    await expect(
      svc.assertCanJoin('b', 'guest:c', ['host:1', 'guest:a']),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CAPACITY_REACHED',
      }) as unknown,
    });
  });

  it('lets someone already in the room rejoin at the cap', async () => {
    const { svc } = build({ video_minutes: 2000, video_participants: 2 });
    await expect(
      svc.assertCanJoin('b', 'guest:a', ['host:1', 'guest:a']),
    ).resolves.toBeUndefined();
  });

  it('does not cap plans with custom (unset) limits', async () => {
    const { svc } = build({ video_minutes: null, video_participants: null });
    await expect(
      svc.assertCanJoin(
        'b',
        'guest:z',
        Array.from({ length: 500 }, (_, i) => `g:${i}`),
      ),
    ).resolves.toBeUndefined();
  });
  describe('recording', () => {
    it('is never allowed during a free trial, even on a recording plan', async () => {
      const { svc, assertAllowance } = build(
        { video_recording_minutes: 1200 },
        'Professional',
        'trialing',
      );
      await expect(svc.assertCanRecord('b')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TRIAL_METERED_DISABLED',
        }) as unknown,
      });
      expect(assertAllowance).not.toHaveBeenCalled();
    });

    it('is refused on plans that do not include it', async () => {
      const { svc } = build({ video_recording_minutes: 0 }, 'Growth');
      await expect(svc.assertCanRecord('b')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'FEATURE_NOT_IN_PLAN',
        }) as unknown,
      });
    });

    it('checks the monthly recorded-minutes allowance on paid plans', async () => {
      const { svc, assertAllowance } = build({ video_recording_minutes: 1200 });
      await svc.assertCanRecord('b');
      expect(assertAllowance).toHaveBeenCalledWith(
        'b',
        'video_recording_minutes',
      );
    });
  });
});
