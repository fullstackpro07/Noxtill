"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TERM_PATTERN = exports.TERMINOLOGY_ERROR_CODES = exports.DEFAULT_TERMS = void 0;
exports.DEFAULT_TERMS = {
    general: {
        customer: 'Customer',
        order: 'Order',
        product: 'Product',
        staff: 'Staff',
        branch: 'Branch',
        appointment: 'Appointment',
        invoice: 'Invoice',
    },
    pdf: {
        orderNumber: 'Order #',
        item: 'Item',
        qty: 'Qty',
        price: 'Price',
        subtotal: 'Subtotal',
        discount: 'Discount',
        total: 'Total',
    },
};
exports.TERMINOLOGY_ERROR_CODES = {
    UNKNOWN_AREA: 'terminology.unknown_area',
};
exports.TERM_PATTERN = /\{\{term:(?:([\w-]+)\.)?([\w-]+)\}\}/g;
//# sourceMappingURL=terminology.constants.js.map