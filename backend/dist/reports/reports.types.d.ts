export type ReportKind = 'monthly' | 'pnl' | 'sales' | 'staff' | 'reviews';
export declare const REPORT_LABELS: Record<ReportKind, string>;
export declare function isReportKind(value: string): value is ReportKind;
export declare function round2(value: number): number;
export declare function currentMonth(): string;
export declare function monthBounds(month: string): {
    start: Date;
    end: Date;
};
