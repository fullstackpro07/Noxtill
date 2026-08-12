export declare const DASHBOARD_TODAY_WIDGET_KEYS: readonly ["revenue_today", "orders_today", "low_stock_count", "upcoming_appointments", "credit_outstanding", "reviews_average"];
export declare const DEFAULT_HEALTH_SCORE_WEIGHTS: {
    readonly ratingTrend: 25;
    readonly repeatCustomerRate: 25;
    readonly margin: 25;
    readonly creditRecovery: 25;
};
export declare const HEALTH_SCORE_SNAPSHOT_QUEUE = "health-score-snapshot";
export declare const HEALTH_SCORE_WINDOW_WEEKS = 12;
export declare const AI_INSIGHTS_QUEUE = "ai-insights";
export declare const SALES_NOTABLE_DELTA_PERCENT = 15;
export declare const CREDIT_NOTABLE_OVERDUE_DAYS = 30;
export declare const MARKETING_QUIET_DAYS = 30;
