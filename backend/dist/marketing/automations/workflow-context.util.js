"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTriggerContext = buildTriggerContext;
const prisma_1 = require("../../../generated/prisma");
async function buildTriggerContext(reader, triggerKey, event) {
    const base = {
        description: event.description,
        amount: event.amount ?? undefined,
    };
    switch (triggerKey) {
        case prisma_1.WorkflowTriggerKey.sale: {
            const order = event.entityId
                ? await reader.order.findUnique({ where: { id: event.entityId } })
                : null;
            return {
                ...base,
                customerId: order?.customerId ?? undefined,
                orderTotal: order ? Number(order.total) : undefined,
                orderNo: order?.orderNo,
            };
        }
        case prisma_1.WorkflowTriggerKey.booking_completed: {
            const appt = event.entityId
                ? await reader.appointment.findUnique({
                    where: { id: event.entityId },
                    include: { service: { select: { name: true } } },
                })
                : null;
            return {
                ...base,
                customerId: appt?.customerId,
                serviceName: appt?.service.name,
            };
        }
        case prisma_1.WorkflowTriggerKey.review: {
            const reviewRequest = event.entityId
                ? await reader.reviewRequest.findUnique({
                    where: { id: event.entityId },
                })
                : null;
            return {
                ...base,
                customerId: reviewRequest?.customerId ?? undefined,
                reviewRating: reviewRequest?.stars ?? undefined,
            };
        }
        case prisma_1.WorkflowTriggerKey.lapsed_customer:
        case prisma_1.WorkflowTriggerKey.birthday: {
            const customer = event.entityId
                ? await reader.customer.findUnique({ where: { id: event.entityId } })
                : null;
            return {
                ...base,
                customerId: event.entityId ?? undefined,
                customerName: customer?.name,
            };
        }
        case prisma_1.WorkflowTriggerKey.credit_overdue: {
            const installment = event.entityId
                ? await reader.installment.findUnique({
                    where: { id: event.entityId },
                    include: { plan: { select: { customerId: true } } },
                })
                : null;
            return {
                ...base,
                customerId: installment?.plan.customerId,
                installmentAmount: installment ? Number(installment.amount) : undefined,
            };
        }
        case prisma_1.WorkflowTriggerKey.low_stock:
            return base;
        default:
            return base;
    }
}
//# sourceMappingURL=workflow-context.util.js.map