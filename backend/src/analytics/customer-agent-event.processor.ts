import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import {
  CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
  CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
  CUSTOMER_LAPSED_EVENT_JOB,
  CUSTOMER_NO_SHOW_EVENT_JOB,
  CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
  SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { CustomerIntelligenceService } from '../customers/customer-intelligence.service';
import { excludeErasedCustomers } from '../customers/segment-rules.util';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type CustomerLapsedEvent = {
  businessId: string;
  activityEventId: string;
};

type CustomerOrderCompletedEvent = {
  businessId: string;
  orderId: string;
  occurredAt: string;
};

@Processor(SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE)
@Injectable()
export class CustomerAgentEventProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: CustomerIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const attemptsMade = job.attemptsMade ?? 0;
    if (job.name === CUSTOMER_DELIVERY_FAILED_EVENT_JOB) {
      return this.processDeliveryFailure(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_NO_SHOW_EVENT_JOB) {
      return this.processNoShow(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB) {
      return this.processCancelledAppointment(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_ORDER_COMPLETED_EVENT_JOB) {
      return this.processCompletedSale(job.data, attemptsMade);
    }
    if (job.name !== CUSTOMER_LAPSED_EVENT_JOB) return;
    const event = this.parseEvent(job.data);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerLapsedEventReviewEnabled')
    ) {
      return;
    }

    const activityEvent = await this.prisma.activityEvent.findFirst({
      where: {
        id: event.activityEventId,
        businessId: event.businessId,
        type: 'customer_lapsed',
        entityType: 'Customer',
        entityId: { not: null },
      },
      select: { id: true, entityId: true, createdAt: true },
    });
    if (!activityEvent?.entityId) return;

    const customer = await this.prisma.customer.findFirst({
      where: excludeErasedCustomers({
        id: activityEvent.entityId,
        businessId: event.businessId,
      }),
      select: { id: true, tags: true },
    });
    const tags = Array.isArray(customer?.tags) ? customer.tags : [];
    if (!customer || !tags.includes('Lapsed')) return;

    // The CRM may emit many newly-lapsed events together. One aggregate review per business and
    // UTC day avoids generating a full same-day review for every customer transition.
    const utcDay = activityEvent.createdAt.toISOString().slice(0, 10);
    const idempotencyKey = `customer-lapsed-daily:${event.businessId}:${utcDay}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: idempotencyKey,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(
        event.businessId,
        null,
        'current_business',
        attempt.idempotencyKey,
        event.businessId,
        {
          triggerType: 'event',
          includeAiSummary: false,
          triggerRef: createSpecialistAgentTriggerRef({
            eventId: idempotencyKey,
            sourceModule: 'customers',
            entityType: 'Business',
            entityId: event.businessId,
            occurredAt: new Date(`${utcDay}T00:00:00.000Z`),
            entityVersion: utcDay,
          }),
        },
      );
    });
  }

  private async processCompletedSale(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseCompletedSale(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerCompletedSaleEventReviewEnabled')
    ) {
      return;
    }

    const occurredAt = new Date(event.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) return;
    const order = await this.prisma.order.findFirst({
      where: {
        id: event.orderId,
        businessId: event.businessId,
        status: 'completed',
        isQuotation: false,
        customerId: { not: null },
        createdAt: occurredAt,
      },
      select: { id: true, customerId: true, createdAt: true },
    });
    if (!order?.customerId) return;

    const customer = await this.prisma.customer.findFirst({
      where: excludeErasedCustomers({
        id: order.customerId,
        businessId: event.businessId,
      }),
      select: { id: true },
    });
    if (!customer) return;

    // Multiple sales can arrive together. One aggregate review per business and UTC day keeps
    // this opt-in useful without producing a separate agent run for every customer-linked sale.
    const utcDay = order.createdAt.toISOString().slice(0, 10);
    const idempotencyKey = `customer-sale-daily:${event.businessId}:${utcDay}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: idempotencyKey,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(
        event.businessId,
        null,
        'current_business',
        attempt.idempotencyKey,
        event.businessId,
        {
          triggerType: 'event',
          includeAiSummary: false,
          triggerRef: createSpecialistAgentTriggerRef({
            eventId: idempotencyKey,
            sourceModule: 'customers',
            entityType: 'Business',
            entityId: event.businessId,
            occurredAt: new Date(`${utcDay}T00:00:00.000Z`),
            entityVersion: utcDay,
          }),
        },
      );
    });
  }

  private async processDeliveryFailure(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseDeliveryFailure(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerDeliveryFailedEventReviewEnabled')
    ) {
      return;
    }

    const failedAt = new Date(event.failedAt);
    if (Number.isNaN(failedAt.getTime())) return;
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: event.deliveryId,
        businessId: event.businessId,
        status: 'failed',
        updatedAt: failedAt,
      },
      select: {
        id: true,
        order: {
          select: {
            customer: { select: { id: true, phone: true } },
          },
        },
      },
    });
    const customer = delivery?.order.customer;
    if (!delivery || !customer || customer.phone === `erased-${customer.id}`) {
      return;
    }

    const eventId = `delivery-failed:${delivery.id}:${failedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: `customer:${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.reviewFailedDelivery(
        event.businessId,
        delivery.id,
        failedAt,
        attempt.idempotencyKey,
      );
    });
  }

  private async processNoShow(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseNoShow(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerNoShowEventReviewEnabled')
    ) {
      return;
    }

    const noShowAt = new Date(event.noShowAt);
    if (Number.isNaN(noShowAt.getTime())) return;
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: event.appointmentId,
        businessId: event.businessId,
        status: 'no_show',
        updatedAt: noShowAt,
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    const customer = appointment?.customer;
    if (
      !appointment ||
      !customer ||
      customer.phone === `erased-${customer.id}`
    ) {
      return;
    }

    const eventId = `appointment-no-show:${appointment.id}:${appointment.updatedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: `customer:${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.reviewNoShowAppointment(
        event.businessId,
        appointment.id,
        appointment.updatedAt,
        attempt.idempotencyKey,
      );
    });
  }

  private async processCancelledAppointment(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseCancelledAppointment(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerAppointmentCancelledEventReviewEnabled')
    ) {
      return;
    }

    const cancelledAt = new Date(event.cancelledAt);
    if (Number.isNaN(cancelledAt.getTime())) return;
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: event.appointmentId,
        businessId: event.businessId,
        status: 'cancelled',
        updatedAt: cancelledAt,
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    const customer = appointment?.customer;
    if (
      !appointment ||
      !customer ||
      customer.phone === `erased-${customer.id}`
    ) {
      return;
    }

    const eventId = `appointment-cancelled:${appointment.id}:${appointment.updatedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: `customer:${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.reviewCancelledAppointment(
        event.businessId,
        appointment.id,
        appointment.updatedAt,
        attempt.idempotencyKey,
      );
    });
  }

  private parseCompletedSale(value: unknown): CustomerOrderCompletedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('orderId' in value) ||
      !('occurredAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.orderId !== 'string' ||
      !value.orderId.trim() ||
      typeof value.occurredAt !== 'string' ||
      !value.occurredAt.trim()
    ) {
      throw new Error(
        'Invalid Customer completed-sale specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      orderId: value.orderId,
      occurredAt: value.occurredAt,
    };
  }

  private parseNoShow(value: unknown): {
    businessId: string;
    appointmentId: string;
    noShowAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('appointmentId' in value) ||
      !('noShowAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.appointmentId !== 'string' ||
      !value.appointmentId.trim() ||
      typeof value.noShowAt !== 'string' ||
      !value.noShowAt.trim()
    ) {
      throw new Error('Invalid Customer no-show specialist event payload');
    }
    return {
      businessId: value.businessId,
      appointmentId: value.appointmentId,
      noShowAt: value.noShowAt,
    };
  }

  private parseCancelledAppointment(value: unknown): {
    businessId: string;
    appointmentId: string;
    cancelledAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('appointmentId' in value) ||
      !('cancelledAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.appointmentId !== 'string' ||
      !value.appointmentId.trim() ||
      typeof value.cancelledAt !== 'string' ||
      !value.cancelledAt.trim()
    ) {
      throw new Error(
        'Invalid Customer appointment-cancelled specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      appointmentId: value.appointmentId,
      cancelledAt: value.cancelledAt,
    };
  }

  private parseDeliveryFailure(value: unknown): {
    businessId: string;
    deliveryId: string;
    failedAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('deliveryId' in value) ||
      !('failedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.deliveryId !== 'string' ||
      !value.deliveryId.trim() ||
      typeof value.failedAt !== 'string' ||
      !value.failedAt.trim()
    ) {
      throw new Error('Invalid Customer delivery failure event payload');
    }
    return {
      businessId: value.businessId,
      deliveryId: value.deliveryId,
      failedAt: value.failedAt,
    };
  }

  private parseEvent(value: unknown): CustomerLapsedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('activityEventId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.activityEventId !== 'string' ||
      !value.activityEventId.trim()
    ) {
      throw new Error('Invalid Customer lapsed specialist event payload');
    }
    return {
      businessId: value.businessId,
      activityEventId: value.activityEventId,
    };
  }
}
