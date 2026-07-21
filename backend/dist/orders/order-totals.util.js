"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeOrderTotals = computeOrderTotals;
function round2(value) {
    return Math.round(value * 100) / 100;
}
function computeOrderTotals(items, discount, taxRatePercent) {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const cogs = items.reduce((sum, item) => sum + item.cost * item.qty, 0);
    const taxableAmount = subtotal - discount;
    const tax = round2(taxableAmount * (taxRatePercent / 100));
    const total = round2(taxableAmount + tax);
    return { subtotal: round2(subtotal), tax, total, cogs: round2(cogs) };
}
//# sourceMappingURL=order-totals.util.js.map