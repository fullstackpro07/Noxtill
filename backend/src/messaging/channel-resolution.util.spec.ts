import { resolveChannel } from './channel-resolution.util';

describe('resolveChannel (UPD-BE-118 configurable priority)', () => {
  it('falls back to the original hardcoded whatsapp→sms→email order when no business priority is set', () => {
    const channel = resolveChannel('email', { phone: '+15551234567' });
    expect(channel).toBe('whatsapp');
  });

  it('respects a real configured business fallback order over the hardcoded default', () => {
    const channel = resolveChannel('email', { phone: '+15551234567' }, [
      'sms',
      'email',
      'whatsapp',
    ]);
    expect(channel).toBe('sms');
  });

  it('an empty business priority array still falls back to the hardcoded default (backward compatible)', () => {
    const channel = resolveChannel('email', { phone: '+15551234567' }, []);
    expect(channel).toBe('whatsapp');
  });

  it('still skips any channel the contact has no usable info for, regardless of priority order', () => {
    const channel = resolveChannel('whatsapp', { email: 'a@example.com' }, [
      'whatsapp',
      'sms',
      'email',
    ]);
    expect(channel).toBe('email');
  });

  it('returns undefined when the contact has no usable channel at all', () => {
    const channel = resolveChannel('whatsapp', {});
    expect(channel).toBeUndefined();
  });
});
