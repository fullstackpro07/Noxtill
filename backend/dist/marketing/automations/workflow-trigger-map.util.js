"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapActivityEventToTriggerKey = mapActivityEventToTriggerKey;
const prisma_1 = require("../../../generated/prisma");
function mapActivityEventToTriggerKey(type, description) {
    switch (type) {
        case prisma_1.ActivityEventType.sale:
            return prisma_1.WorkflowTriggerKey.sale;
        case prisma_1.ActivityEventType.booking:
            return description === 'Appointment completed'
                ? prisma_1.WorkflowTriggerKey.booking_completed
                : null;
        case prisma_1.ActivityEventType.review:
            return prisma_1.WorkflowTriggerKey.review;
        case prisma_1.ActivityEventType.low_stock:
            return prisma_1.WorkflowTriggerKey.low_stock;
        case prisma_1.ActivityEventType.customer_lapsed:
            return prisma_1.WorkflowTriggerKey.lapsed_customer;
        case prisma_1.ActivityEventType.credit_overdue:
            return prisma_1.WorkflowTriggerKey.credit_overdue;
        case prisma_1.ActivityEventType.birthday:
            return prisma_1.WorkflowTriggerKey.birthday;
        default:
            return null;
    }
}
//# sourceMappingURL=workflow-trigger-map.util.js.map