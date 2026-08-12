"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_ERROR_CODES = exports.ORDER_STATUS_TRANSITIONS = void 0;
const prisma_1 = require("../../generated/prisma");
exports.ORDER_STATUS_TRANSITIONS = {
    draft: [],
    pending: [prisma_1.OrderStatus.confirmed, prisma_1.OrderStatus.cancelled],
    confirmed: [prisma_1.OrderStatus.in_progress, prisma_1.OrderStatus.cancelled],
    in_progress: [prisma_1.OrderStatus.completed, prisma_1.OrderStatus.cancelled],
    completed: [],
    cancelled: [],
};
exports.ORDER_ERROR_CODES = {
    PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
    INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
    CREDIT_REQUIRES_CUSTOMER: 'CREDIT_REQUIRES_CUSTOMER',
    INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
    ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
};
//# sourceMappingURL=orders.constants.js.map