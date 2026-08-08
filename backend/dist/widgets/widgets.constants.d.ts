export declare const WIDGET_ERROR_CODES: {
    readonly WIDGET_NOT_FOUND: "WIDGET_NOT_FOUND";
    readonly INVALID_RANGE: "INVALID_RANGE";
};
export declare const WIDGET_CACHE_TTL_MS = 60000;
export declare const WIDGET_RANGE_DAYS: readonly [7, 30, 90];
export type WidgetRangeDays = (typeof WIDGET_RANGE_DAYS)[number];
export type WidgetCategory = 'sales' | 'inventory' | 'credit' | 'bookings' | 'reviews' | 'marketing' | 'staff' | 'messaging';
