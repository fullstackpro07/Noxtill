"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKETING_QUIET_DAYS = exports.CREDIT_NOTABLE_OVERDUE_DAYS = exports.SALES_NOTABLE_DELTA_PERCENT = exports.AI_INSIGHTS_QUEUE = exports.HEALTH_SCORE_WINDOW_WEEKS = exports.HEALTH_SCORE_SNAPSHOT_QUEUE = exports.DEFAULT_HEALTH_SCORE_WEIGHTS = exports.DASHBOARD_TODAY_WIDGET_KEYS = void 0;
exports.DASHBOARD_TODAY_WIDGET_KEYS = [
    'revenue_today',
    'orders_today',
    'low_stock_count',
    'upcoming_appointments',
    'credit_outstanding',
    'reviews_average',
];
exports.DEFAULT_HEALTH_SCORE_WEIGHTS = {
    ratingTrend: 25,
    repeatCustomerRate: 25,
    margin: 25,
    creditRecovery: 25,
};
exports.HEALTH_SCORE_SNAPSHOT_QUEUE = 'health-score-snapshot';
exports.HEALTH_SCORE_WINDOW_WEEKS = 12;
exports.AI_INSIGHTS_QUEUE = 'ai-insights';
exports.SALES_NOTABLE_DELTA_PERCENT = 15;
exports.CREDIT_NOTABLE_OVERDUE_DAYS = 30;
exports.MARKETING_QUIET_DAYS = 30;
//# sourceMappingURL=dashboard.constants.js.map