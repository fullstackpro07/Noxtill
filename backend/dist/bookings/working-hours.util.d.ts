declare const DAY_KEYS: readonly ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
type DayKey = (typeof DAY_KEYS)[number];
type DayRanges = [string, string][];
export type WorkingHours = Partial<Record<DayKey, DayRanges>>;
interface BusyInterval {
    start: Date;
    end: Date;
}
export declare function computeAvailableSlots(params: {
    workingHours: WorkingHours;
    timezone: string;
    date: string;
    durationMin: number;
    busyIntervals: BusyInterval[];
    now?: Date;
}): Date[];
export {};
