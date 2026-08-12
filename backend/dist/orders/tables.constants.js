"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_ORDER_STATUSES = exports.TABLE_ERROR_CODES = void 0;
exports.TABLE_ERROR_CODES = {
    TABLE_NOT_FOUND: 'tables.not_found',
    NUMBER_TAKEN: 'tables.number_taken',
    NO_ACTIVE_ORDER: 'tables.no_active_order',
    DESTINATION_OCCUPIED: 'tables.destination_occupied',
};
exports.ACTIVE_ORDER_STATUSES = [
    'draft',
    'pending',
    'confirmed',
    'in_progress',
];
//# sourceMappingURL=tables.constants.js.map