import {
  nextCronOccurrence,
  validateCronSchedule,
  validateScheduleConfiguration,
} from './workflow-schedule.util';

describe('workflow schedule cron utilities', () => {
  it('validates five-field cron expressions and IANA time zones', () => {
    expect(validateCronSchedule('0 9 * * 1-5', 'Asia/Karachi')).toBeNull();
    expect(validateCronSchedule('0 9 * * 1-5 *', 'UTC')).toMatch(
      /five-field cron expression/,
    );
    expect(validateCronSchedule('61 9 * * *', 'UTC')).toMatch(/invalid/);
    expect(validateCronSchedule('0 9 * * *', 'Mars/Olympus')).toMatch(
      /invalid/,
    );
  });

  it('requires exactly one interval or cron configuration', () => {
    expect(validateScheduleConfiguration(60, null, 'UTC')).toBeNull();
    expect(
      validateScheduleConfiguration(null, '0 9 * * 1-5', 'Asia/Karachi'),
    ).toBeNull();
    expect(validateScheduleConfiguration(null, null, 'UTC')).toMatch(
      /exactly one/,
    );
    expect(validateScheduleConfiguration(60, '0 9 * * *', 'UTC')).toMatch(
      /exactly one/,
    );
  });

  it('computes next occurrences in the configured local time zone', () => {
    expect(
      nextCronOccurrence(
        '0 9 * * 1-5',
        'Asia/Karachi',
        new Date('2026-09-29T03:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-09-29T04:00:00.000Z');
  });

  it('advances beyond a delayed tick without replaying every missed minute', () => {
    expect(
      nextCronOccurrence(
        '0 9 * * *',
        'Asia/Karachi',
        new Date('2026-09-29T12:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-09-30T04:00:00.000Z');
  });

  it('keeps the requested wall-clock time across a daylight-saving transition', () => {
    expect(
      nextCronOccurrence(
        '0 9 * * *',
        'America/New_York',
        new Date('2026-03-07T15:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-03-08T13:00:00.000Z');
  });
});
