import { computeAvailableSlots } from './working-hours.util';

describe('computeAvailableSlots (BE-052)', () => {
  it('generates slots stepped by service duration within a UTC working range', () => {
    const slots = computeAvailableSlots({
      workingHours: { wed: [['09:00', '11:00']] },
      timezone: 'UTC',
      date: '2026-07-22', // a Wednesday
      durationMin: 30,
      busyIntervals: [],
      now: new Date('2026-07-20T00:00:00Z'),
    });

    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-07-22T09:00:00.000Z',
      '2026-07-22T09:30:00.000Z',
      '2026-07-22T10:00:00.000Z',
      '2026-07-22T10:30:00.000Z',
    ]);
  });

  it('returns no slots for a day with no configured working hours', () => {
    const slots = computeAvailableSlots({
      workingHours: { wed: [['09:00', '11:00']] },
      timezone: 'UTC',
      date: '2026-07-23', // Thursday — not configured
      durationMin: 30,
      busyIntervals: [],
      now: new Date('2026-07-20T00:00:00Z'),
    });
    expect(slots).toEqual([]);
  });

  it('excludes a slot that overlaps an existing appointment', () => {
    const slots = computeAvailableSlots({
      workingHours: { wed: [['09:00', '11:00']] },
      timezone: 'UTC',
      date: '2026-07-22',
      durationMin: 30,
      busyIntervals: [
        {
          start: new Date('2026-07-22T09:30:00Z'),
          end: new Date('2026-07-22T10:00:00Z'),
        },
      ],
      now: new Date('2026-07-20T00:00:00Z'),
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-07-22T09:00:00.000Z',
      '2026-07-22T10:00:00.000Z',
      '2026-07-22T10:30:00.000Z',
    ]);
  });

  it('excludes slots that have already passed relative to `now`', () => {
    const slots = computeAvailableSlots({
      workingHours: { wed: [['09:00', '11:00']] },
      timezone: 'UTC',
      date: '2026-07-22',
      durationMin: 30,
      busyIntervals: [],
      now: new Date('2026-07-22T10:00:00Z'),
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-07-22T10:00:00.000Z',
      '2026-07-22T10:30:00.000Z',
    ]);
  });
});
