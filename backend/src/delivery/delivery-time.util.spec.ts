import { startOfDayInZone } from './delivery-time.util';

describe('startOfDayInZone', () => {
  it('UTC midnight for a UTC business', () => {
    expect(
      startOfDayInZone('UTC', new Date('2026-09-25T15:30:00Z')).toISOString(),
    ).toBe('2026-09-25T00:00:00.000Z');
  });

  it('a Karachi (UTC+5) business day begins 19:00 UTC the evening before', () => {
    // 02:00 local on 26 Sep is 21:00 UTC on 25 Sep — still the 26th for that shop.
    expect(
      startOfDayInZone(
        'Asia/Karachi',
        new Date('2026-09-25T21:00:00Z'),
      ).toISOString(),
    ).toBe('2026-09-25T19:00:00.000Z');
    expect(
      startOfDayInZone(
        'Asia/Karachi',
        new Date('2026-09-25T10:00:00Z'),
      ).toISOString(),
    ).toBe('2026-09-24T19:00:00.000Z');
  });
});
