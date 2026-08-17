"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateConditions = evaluateConditions;
function toComparableString(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}
function evaluateConditions(conditions, context) {
    return conditions.every((condition) => {
        const actual = context[condition.field];
        if (actual === undefined || actual === null)
            return false;
        switch (condition.operator) {
            case 'eq':
                return toComparableString(actual) === String(condition.value);
            case 'neq':
                return toComparableString(actual) !== String(condition.value);
            case 'gt':
                return Number(actual) > Number(condition.value);
            case 'gte':
                return Number(actual) >= Number(condition.value);
            case 'lt':
                return Number(actual) < Number(condition.value);
            case 'lte':
                return Number(actual) <= Number(condition.value);
            case 'contains':
                return toComparableString(actual)
                    .toLowerCase()
                    .includes(String(condition.value).toLowerCase());
            default:
                return false;
        }
    });
}
//# sourceMappingURL=workflow-condition.util.js.map