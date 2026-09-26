import {
  describeWeeklyHours,
  isWithinHours,
  parseWeeklyHours,
  workingMinutesBetween,
} from './inbox-hours.util';

describe('inbox working-hours clock', () => {
  const hours = parseWeeklyHours({
    mon: [['10:00', '20:00']],
    tue: [['10:00', '20:00']],
    sun: [],
    bogus: [['x', 'y']],
  });

  it('drops malformed days and ranges', () => {
    expect(Object.keys(hours).sort()).toEqual(['mon', 'tue']);
  });

  it('counts plain elapsed minutes when no hours are set', () => {
    const start = new Date('2026-09-28T09:00:00Z');
    expect(
      workingMinutesBetween(start, new Date('2026-09-28T11:30:00Z'), {}, 'UTC'),
    ).toBe(150);
  });

  it('stops the clock outside working hours (UTC)', () => {
    // Monday 19:50 → Tuesday 10:15 = 10 min Monday + 15 min Tuesday.
    const start = new Date('2026-09-28T19:50:00Z');
    const end = new Date('2026-09-29T10:15:00Z');
    expect(workingMinutesBetween(start, end, hours, 'UTC')).toBe(25);
  });

  it('respects the business timezone', () => {
    // Asia/Karachi is UTC+5: 05:00Z Monday = 10:00 local, 06:00Z = 11:00 local.
    const start = new Date('2026-09-28T04:00:00Z');
    const end = new Date('2026-09-28T06:00:00Z');
    expect(workingMinutesBetween(start, end, hours, 'Asia/Karachi')).toBe(60);
    expect(
      isWithinHours(new Date('2026-09-28T04:59:00Z'), hours, 'Asia/Karachi'),
    ).toBe(false);
    expect(
      isWithinHours(new Date('2026-09-28T05:00:00Z'), hours, 'Asia/Karachi'),
    ).toBe(true);
  });

  it('treats no hours as always open', () => {
    expect(isWithinHours(new Date(), {}, 'UTC')).toBe(true);
  });

  it('groups identical days for the Settings screen', () => {
    const rows = describeWeeklyHours(hours);
    expect(rows[0]).toEqual({
      days: 'Monday to Tuesday',
      ranges: '10:00 AM – 8:00 PM',
    });
    expect(rows[1]).toEqual({ days: 'Wednesday to Sunday', ranges: null });
  });
});
