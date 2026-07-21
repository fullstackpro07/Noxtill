"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAvailableSlots = computeAvailableSlots;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function zonedTimeToUtc(dateStr, timeStr, timezone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const asUtc = Date.UTC(year, month - 1, day, hour, minute);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(asUtc));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    const offset = asIfUtc - asUtc;
    return new Date(asUtc - offset);
}
function dayKeyFor(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
function computeAvailableSlots(params) {
    const { workingHours, timezone, date, durationMin, busyIntervals } = params;
    const now = params.now ?? new Date();
    const ranges = workingHours[dayKeyFor(date)] ?? [];
    const stepMs = durationMin * 60 * 1000;
    const slots = [];
    for (const [rangeStart, rangeEnd] of ranges) {
        let cursor = zonedTimeToUtc(date, rangeStart, timezone);
        const rangeEndUtc = zonedTimeToUtc(date, rangeEnd, timezone);
        while (cursor.getTime() + stepMs <= rangeEndUtc.getTime()) {
            const slotEnd = new Date(cursor.getTime() + stepMs);
            const isPast = cursor.getTime() < now.getTime();
            const overlaps = busyIntervals.some((busy) => cursor.getTime() < busy.end.getTime() &&
                slotEnd.getTime() > busy.start.getTime());
            if (!isPast && !overlaps) {
                slots.push(new Date(cursor));
            }
            cursor = slotEnd;
        }
    }
    return slots;
}
//# sourceMappingURL=working-hours.util.js.map