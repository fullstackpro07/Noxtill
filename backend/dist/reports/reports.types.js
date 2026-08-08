"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_LABELS = void 0;
exports.isReportKind = isReportKind;
exports.round2 = round2;
exports.currentMonth = currentMonth;
exports.monthBounds = monthBounds;
exports.REPORT_LABELS = {
    monthly: 'Monthly summary',
    pnl: 'Profit & loss',
    sales: 'Sales report',
    staff: 'Staff performance',
    reviews: 'Reviews summary',
};
function isReportKind(value) {
    return value in exports.REPORT_LABELS;
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function currentMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthBounds(month) {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));
    return { start, end };
}
//# sourceMappingURL=reports.types.js.map