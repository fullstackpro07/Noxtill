import { OrderStatus } from '../../generated/prisma';
export declare const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare const ORDER_ERROR_CODES: {
    readonly PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND";
    readonly INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK";
    readonly CREDIT_REQUIRES_CUSTOMER: "CREDIT_REQUIRES_CUSTOMER";
    readonly INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION";
    readonly ORDER_NOT_FOUND: "ORDER_NOT_FOUND";
};
