import { WorkflowTriggerKey } from '../../../generated/prisma';

export interface TriggerEvent {
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number | null;
}

/**
 * Narrow reader shape `buildTriggerContext` actually needs — satisfied structurally by both the
 * raw `PrismaService` (used by `WorkflowTriggerService.dispatch`, which has no request-scoped
 * tenant context) and `TenantPrismaService.client` (used by `WorkflowsService.test`'s dry run),
 * same hand-written-subset pattern as `CouponsService.CouponTxClient`.
 */
export interface ContextReader {
  order: {
    findUnique(args: { where: { id: string } }): Promise<{
      customerId: string | null;
      total: unknown;
      orderNo: number;
    } | null>;
  };
  appointment: {
    findUnique(args: {
      where: { id: string };
      include: { service: { select: { name: true } } };
    }): Promise<{ customerId: string; service: { name: string } } | null>;
  };
  reviewRequest: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ customerId: string | null; stars: number | null } | null>;
  };
  customer: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ name: string } | null>;
  };
  installment: {
    findUnique(args: {
      where: { id: string };
      include: { plan: { select: { customerId: true } } };
    }): Promise<{
      amount: unknown;
      plan: { customerId: string };
    } | null>;
  };
}

/** Builds the flat condition/action context for a trigger firing, resolving the real customer/entity data behind an opaque `ActivityEvent.entityId`. */
export async function buildTriggerContext(
  reader: ContextReader,
  triggerKey: WorkflowTriggerKey,
  event: TriggerEvent,
): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    description: event.description,
    amount: event.amount ?? undefined,
  };

  switch (triggerKey) {
    case WorkflowTriggerKey.sale: {
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
    case WorkflowTriggerKey.booking_completed: {
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
    case WorkflowTriggerKey.review: {
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
    case WorkflowTriggerKey.lapsed_customer:
    case WorkflowTriggerKey.birthday: {
      const customer = event.entityId
        ? await reader.customer.findUnique({ where: { id: event.entityId } })
        : null;
      return {
        ...base,
        customerId: event.entityId ?? undefined,
        customerName: customer?.name,
      };
    }
    case WorkflowTriggerKey.credit_overdue: {
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
    case WorkflowTriggerKey.low_stock:
      return base;
    default:
      return base;
  }
}
