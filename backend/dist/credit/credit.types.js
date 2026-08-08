"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLedgerRows = buildLedgerRows;
function buildLedgerRows(entries) {
    let running = 0;
    return entries.map((entry) => {
        const amount = Number(entry.amount);
        running += entry.kind === 'credit' ? amount : -amount;
        return {
            id: entry.id,
            date: entry.createdAt,
            kind: entry.kind,
            amount,
            note: entry.note,
            runningBalance: running,
        };
    });
}
//# sourceMappingURL=credit.types.js.map