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
  CUSTOMER_AGENT_MESSAGE_SEND_IDEMPOTENCY_PREFIX,
  CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
  CUSTOMER_APPOINTMENT_COMPLETED_EVENT_JOB,
  CUSTOMER_APPOINTMENT_RESCHEDULED_EVENT_JOB,
  CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
  CUSTOMER_LAPSED_EVENT_JOB,
  CUSTOMER_MESSAGE_DELIVERY_CONFIRMED_EVENT_JOB,
  CUSTOMER_NO_SHOW_EVENT_JOB,
  CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
  CUSTOMER_ORDER_CANCELLED_EVENT_JOB,
  CUSTOMER_REVIEW_RECEIVED_EVENT_JOB,
  CUSTOMER_RETURN_APPROVED_EVENT_JOB,
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

type CustomerOrderCancelledEvent = {
  businessId: string;
  orderId: string;
  cancelledAt: string;
  eventId: string;
  sourceModule: 'orders';
  entityVersion: string;
  schemaVersion: 1;
  correlationId: string;
};

type CustomerAppointmentCompletedEvent = {
  businessId: string;
  appointmentId: string;
  completedAt: string;
};

type CustomerAppointmentRescheduledEvent = {
  businessId: string;
  appointmentId: string;
  rescheduledAt: string;
};

type CustomerReviewReceivedEvent = {
  businessId: string;
  reviewRequestId: string;
  occurredAt: string;
};

type CustomerMessageDeliveryConfirmedEvent = {
  businessId: string;
  messageId: string;
};

type CustomerReturnApprovedEvent = {
  businessId: string;
  returnId: string;
  approvedAt: string;
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
    if (job.name === CUSTOMER_APPOINTMENT_COMPLETED_EVENT_JOB) {
      return this.processCompletedAppointment(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_APPOINTMENT_RESCHEDULED_EVENT_JOB) {
      return this.processRescheduledAppointment(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_ORDER_COMPLETED_EVENT_JOB) {
      return this.processCompletedSale(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_ORDER_CANCELLED_EVENT_JOB) {
      return this.processCancelledOrder(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_REVIEW_RECEIVED_EVENT_JOB) {
      return this.processReviewReceived(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_MESSAGE_DELIVERY_CONFIRMED_EVENT_JOB) {
      return this.processMessageDeliveryConfirmed(job.data, attemptsMade);
    }
    if (job.name === CUSTOMER_RETURN_APPROVED_EVENT_JOB) {
      return this.processReturnApproved(job.data, attemptsMade);
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

  private async processReturnApproved(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseReturnApproved(value);
    const approvedAt = new Date(event.approvedAt);
    if (!Number.isFinite(approvedAt.getTime())) return;
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, active: true, policies: true },
    });
    if (!business?.active) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      ))
    ) {
      return;
    }
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'orders',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerReturnApprovedEventReviewEnabled')
    ) {
      return;
    }

    const returned = await this.prisma.return.findFirst({
      where: {
        id: event.returnId,
        businessId: event.businessId,
        status: 'approved',
        updatedAt: approvedAt,
        customerId: { not: null },
      },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (
      !returned?.customerId ||
      !returned.customer ||
      returned.customer.phone === `erased-${returned.customer.id}`
    ) {
      return;
    }

    const eventId = `customer-return-approved:${returned.id}:${returned.updatedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: eventId,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.reviewApprovedReturn(
        event.businessId,
        returned.id,
        returned.updatedAt,
        attempt.idempotencyKey,
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

  private async processCancelledOrder(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseCancelledOrder(value);
    const cancelledAt = new Date(event.cancelledAt);
    if (!Number.isFinite(cancelledAt.getTime())) return;

    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, active: true, policies: true },
    });
    if (!business?.active) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      )) ||
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'orders',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool('agents.customerCancelledOrderEventReviewEnabled')
    ) {
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: event.orderId,
        businessId: event.businessId,
        isQuotation: false,
        status: 'cancelled',
        updatedAt: cancelledAt,
        customerId: { not: null },
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (
      !order?.customer ||
      order.customer.phone === `erased-${order.customer.id}`
    ) {
      return;
    }

    const eventId = event.eventId;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: eventId,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.reviewCancelledOrder(
        event.businessId,
        order.id,
        order.updatedAt,
        attempt.idempotencyKey,
        event.correlationId,
      );
    });
  }

  private async processCompletedAppointment(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseCompletedAppointment(value);
    const completedAt = new Date(event.completedAt);
    if (!Number.isFinite(completedAt.getTime())) return;

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
      !policies.bool(
        'agents.customerAppointmentCompletedEventReviewEnabled',
      )
    ) {
      return;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: event.appointmentId,
        businessId: event.businessId,
        status: 'completed',
        updatedAt: completedAt,
        customerId: { not: null },
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (
      !appointment?.customer ||
      appointment.customer.phone === `erased-${appointment.customer.id}`
    ) {
      return;
    }

    // Multiple appointments can complete in a day. One aggregate review per UTC day avoids
    // generating a separate run for each customer-linked appointment.
    const utcDay = appointment.updatedAt.toISOString().slice(0, 10);
    const idempotencyKey = `customer-appointment-completed-daily:${event.businessId}:${utcDay}`;
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
            sourceModule: 'bookings',
            entityType: 'Business',
            entityId: event.businessId,
            occurredAt: new Date(`${utcDay}T00:00:00.000Z`),
            entityVersion: utcDay,
          }),
        },
      );
    });
  }

  private async processRescheduledAppointment(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseRescheduledAppointment(value);
    const rescheduledAt = new Date(event.rescheduledAt);
    if (!Number.isFinite(rescheduledAt.getTime())) return;

    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, active: true, policies: true },
    });
    if (!business?.active) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'customer',
      )) ||
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'bookings',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.customerEnabled') ||
      !policies.bool(
        'agents.customerAppointmentRescheduledEventReviewEnabled',
      )
    ) {
      return;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: event.appointmentId,
        businessId: event.businessId,
        status: { in: ['requested', 'booked', 'confirmed'] },
        updatedAt: rescheduledAt,
        customerId: { not: null },
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (
      !appointment?.customer ||
      appointment.customer.phone === `erased-${appointment.customer.id}`
    ) {
      return;
    }

    // Reschedule bursts are coalesced to one real aggregate Customer review per business and
    // UTC day. The appointment must still match the saved version before this source is counted.
    const utcDay = appointment.updatedAt.toISOString().slice(0, 10);
    const eventId = `customer-appointment-rescheduled-daily:${event.businessId}:${utcDay}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: eventId,
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
            eventId,
            sourceModule: 'bookings',
            entityType: 'Business',
            entityId: event.businessId,
            occurredAt: new Date(`${utcDay}T00:00:00.000Z`),
            entityVersion: utcDay,
          }),
        },
      );
    });
  }

  private async processReviewReceived(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseReviewReceived(value);
    const occurredAt = new Date(event.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) return;

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
      !policies.bool('agents.customerReviewReceivedEventReviewEnabled')
    ) {
      return;
    }

    const review = await this.prisma.reviewRequest.findFirst({
      where: {
        id: event.reviewRequestId,
        businessId: event.businessId,
        customerId: { not: null },
        status: 'rated',
        respondedAt: occurredAt,
      },
      select: {
        id: true,
        businessId: true,
        respondedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    const respondedAt = review?.respondedAt;
    if (
      !review ||
      !respondedAt ||
      !review.customer ||
      review.customer.phone === `erased-${review.customer.id}`
    ) {
      return;
    }

    const eventId = `customer-review-received:${review.id}:${respondedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: eventId,
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
            eventId,
            sourceModule: 'reviews',
            entityType: 'ReviewRequest',
            entityId: review.id,
            occurredAt: respondedAt,
            entityVersion: respondedAt.toISOString(),
          }),
        },
      );
    });
  }

  private async processMessageDeliveryConfirmed(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseMessageDeliveryConfirmed(value);
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
      !policies.bool(
        'agents.customerMessageDeliveryConfirmedEventReviewEnabled',
      )
    ) {
      return;
    }

    const message = await this.prisma.message.findFirst({
      where: {
        id: event.messageId,
        businessId: event.businessId,
        customerId: { not: null },
        idempotencyKey: {
          startsWith: CUSTOMER_AGENT_MESSAGE_SEND_IDEMPOTENCY_PREFIX,
        },
        status: { in: ['delivered', 'read'] },
      },
      select: {
        id: true,
        updatedAt: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (
      !message?.customer ||
      message.customer.phone === `erased-${message.customer.id}`
    ) {
      return;
    }

    const eventId = `customer-message-delivery-confirmed:${message.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'customer_intelligence',
      baseIdempotencyKey: eventId,
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
            eventId,
            sourceModule: 'unified-inbox',
            entityType: 'Message',
            entityId: message.id,
            occurredAt: message.updatedAt,
            entityVersion: message.updatedAt.toISOString(),
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

  private parseCompletedAppointment(
    value: unknown,
  ): CustomerAppointmentCompletedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('appointmentId' in value) ||
      !('completedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.appointmentId !== 'string' ||
      !value.appointmentId.trim() ||
      typeof value.completedAt !== 'string' ||
      !value.completedAt.trim()
    ) {
      throw new Error(
        'Invalid Customer completed-appointment specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      appointmentId: value.appointmentId,
      completedAt: value.completedAt,
    };
  }

  private parseRescheduledAppointment(
    value: unknown,
  ): CustomerAppointmentRescheduledEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('appointmentId' in value) ||
      !('rescheduledAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.appointmentId !== 'string' ||
      !value.appointmentId.trim() ||
      typeof value.rescheduledAt !== 'string' ||
      !value.rescheduledAt.trim()
    ) {
      throw new Error(
        'Invalid Customer appointment-rescheduled specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      appointmentId: value.appointmentId,
      rescheduledAt: value.rescheduledAt,
    };
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

  private parseCancelledOrder(value: unknown): CustomerOrderCancelledEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('orderId' in value) ||
      !('cancelledAt' in value) ||
      !('eventId' in value) ||
      !('sourceModule' in value) ||
      !('entityVersion' in value) ||
      !('schemaVersion' in value) ||
      !('correlationId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.orderId !== 'string' ||
      !value.orderId.trim() ||
      typeof value.cancelledAt !== 'string' ||
      !value.cancelledAt.trim() ||
      typeof value.eventId !== 'string' ||
      !value.eventId.trim() ||
      value.sourceModule !== 'orders' ||
      typeof value.entityVersion !== 'string' ||
      !value.entityVersion.trim() ||
      value.schemaVersion !== 1 ||
      typeof value.correlationId !== 'string' ||
      !value.correlationId.trim() ||
      value.entityVersion !== value.cancelledAt ||
      value.eventId !== `order-cancelled:${value.orderId}:${value.cancelledAt}` ||
      value.correlationId !== value.eventId
    ) {
      throw new Error('Invalid Customer cancelled-order specialist event payload');
    }
    return {
      businessId: value.businessId,
      orderId: value.orderId,
      cancelledAt: value.cancelledAt,
      eventId: value.eventId,
      sourceModule: value.sourceModule,
      entityVersion: value.entityVersion,
      schemaVersion: 1,
      correlationId: value.correlationId,
    };
  }

  private parseReviewReceived(value: unknown): CustomerReviewReceivedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('reviewRequestId' in value) ||
      !('occurredAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.reviewRequestId !== 'string' ||
      !value.reviewRequestId.trim() ||
      typeof value.occurredAt !== 'string' ||
      !value.occurredAt.trim()
    ) {
      throw new Error('Invalid Customer review-received specialist event payload');
    }
    return {
      businessId: value.businessId,
      reviewRequestId: value.reviewRequestId,
      occurredAt: value.occurredAt,
    };
  }

  private parseMessageDeliveryConfirmed(
    value: unknown,
  ): CustomerMessageDeliveryConfirmedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('messageId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.messageId !== 'string' ||
      !value.messageId.trim()
    ) {
      throw new Error(
        'Invalid Customer message-delivery-confirmed specialist event payload',
      );
    }
    return { businessId: value.businessId, messageId: value.messageId };
  }

  private parseReturnApproved(value: unknown): CustomerReturnApprovedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('returnId' in value) ||
      !('approvedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.returnId !== 'string' ||
      !value.returnId.trim() ||
      typeof value.approvedAt !== 'string' ||
      !Number.isFinite(new Date(value.approvedAt).getTime())
    ) {
      throw new Error('Invalid Customer approved-return specialist event payload');
    }
    return {
      businessId: value.businessId,
      returnId: value.returnId,
      approvedAt: new Date(value.approvedAt).toISOString(),
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
